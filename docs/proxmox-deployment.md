# Proxmox Deployment Guide

This guide covers deploying Annex on Proxmox Virtual Environment 9.1+, which includes native Docker container support.

## Available Images

Annex provides three Docker images for different deployment scenarios:

| Image | Use Case | Best For |
|-------|----------|----------|
| `ghcr.io/wehavenoeyes/annex:latest` | All-in-one | Testing, demos, single-server |
| `ghcr.io/wehavenoeyes/annex-server:latest` | Server-only | Production with external DB |
| `ghcr.io/wehavenoeyes/annex-encoder:latest` | Encoder-only | Distributed GPU encoding nodes |

This guide covers all three deployment strategies on Proxmox.

## Prerequisites

### Proxmox 9.1 or Higher

Verify your Proxmox version:

```bash
pveversion
```

You should see version 9.1.0 or higher.

### Install Docker on Proxmox

Proxmox 9.1+ supports running Docker containers natively. Install Docker on your Proxmox host:

```bash
# Update package lists
apt update

# Install Docker dependencies
apt install -y apt-transport-https ca-certificates curl gnupg lsb-release

# Add Docker GPG key
curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Add Docker repository
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Verify installation
docker --version
```

## Deployment Options

Annex supports three deployment modes on Proxmox:

1. **All-in-One**: PostgreSQL, server, and encoder in one container (recommended for single-server setups)
2. **External Database**: Use a separate PostgreSQL VM or container
3. **External Encoders**: Server only, with dedicated encoder nodes

## Option 1: All-in-One Deployment

This is the simplest deployment for getting started. Everything runs in a single container.

### Basic Setup

```bash
# Create persistent volumes
docker volume create annex-postgres
docker volume create annex-config

# Create downloads directory
mkdir -p /mnt/annex/downloads
chmod 755 /mnt/annex/downloads

# Run Annex
docker run -d \
  --name annex \
  -p 8080:80 \
  -v annex-postgres:/data/postgres \
  -v annex-config:/data/config \
  -v /mnt/annex/downloads:/downloads \
  --restart unless-stopped \
  ghcr.io/wehavenoeyes/annex:latest
```

Access the web UI at `http://proxmox-ip:8080`

### With GPU Passthrough (Intel Arc)

For hardware-accelerated AV1 encoding with Intel Arc GPUs:

```bash
# Verify GPU is available
ls -la /dev/dri/

# Run Annex with GPU passthrough
docker run -d \
  --name annex \
  -p 8080:80 \
  --device=/dev/dri:/dev/dri \
  -v annex-postgres:/data/postgres \
  -v annex-config:/data/config \
  -v /mnt/annex/downloads:/downloads \
  --restart unless-stopped \
  ghcr.io/wehavenoeyes/annex:latest
```

The encoder will automatically detect and use the GPU for AV1 encoding. Check logs:

```bash
docker logs annex | grep -i gpu
```

You should see: `[Annex] GPU detected at /dev/dri/renderD128`

## Option 2: External PostgreSQL

Use this when you want to run PostgreSQL in a separate VM or have an existing database server.

### Setup PostgreSQL VM

Create a PostgreSQL VM first (or use an existing one):

```bash
# On the PostgreSQL VM
apt update
apt install -y postgresql

# Create database and user
sudo -u postgres psql << EOF
CREATE DATABASE annex;
CREATE USER annex WITH PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE annex TO annex;
\q
EOF

# Allow network connections
echo "host all all 0.0.0.0/0 md5" >> /etc/postgresql/*/main/pg_hba.conf
echo "listen_addresses = '*'" >> /etc/postgresql/*/main/postgresql.conf

systemctl restart postgresql
```

### Deploy Annex

```bash
# On the Proxmox host
docker run -d \
  --name annex \
  -p 8080:80 \
  -e DATABASE_URL="postgresql://annex:your-secure-password@postgres-vm-ip:5432/annex" \
  -v annex-config:/data/config \
  -v /mnt/annex/downloads:/downloads \
  --restart unless-stopped \
  ghcr.io/wehavenoeyes/annex:latest
```

Note: The `/data/postgres` volume is not needed with external PostgreSQL.

## Option 3: External Encoders Only

Disable the internal encoder when using dedicated Proxmox VMs or containers for encoding.

### Deploy Server

```bash
docker run -d \
  --name annex \
  -p 8080:80 \
  -e DISABLE_INTERNAL_ENCODER=true \
  -v annex-postgres:/data/postgres \
  -v annex-config:/data/config \
  --restart unless-stopped \
  ghcr.io/wehavenoeyes/annex:latest
```

### Deploy Encoder Nodes

On separate Proxmox VMs or containers with GPU access:

```bash
# Download encoder binary
curl -L https://github.com/WeHaveNoEyes/Annex/releases/latest/download/annex-encoder-linux-x64 -o /usr/local/bin/annex-encoder
chmod +x /usr/local/bin/annex-encoder

# Generate and install systemd service
annex-encoder --setup --install

# Configure encoder
cat > /etc/annex-encoder.env << EOF
ANNEX_SERVER_URL=ws://proxmox-ip:8080/encoder
ANNEX_ENCODER_ID=encoder-1
ANNEX_ENCODER_NAME=Proxmox Encoder 1
ANNEX_GPU_DEVICE=/dev/dri/renderD128
ANNEX_NFS_BASE_PATH=/mnt/downloads
ANNEX_MAX_CONCURRENT=1
EOF

# Start encoder
systemctl start annex-encoder
systemctl enable annex-encoder
systemctl status annex-encoder
```

## Storage Configuration

### Shared Storage with NFS

For multi-VM setups, use NFS to share downloads between Annex server and encoder nodes.

**On Proxmox host (NFS server):**

```bash
# Install NFS server
apt install -y nfs-kernel-server

# Create shared directory
mkdir -p /mnt/annex/downloads
chmod 755 /mnt/annex/downloads

# Export directory
cat >> /etc/exports << EOF
/mnt/annex/downloads *(rw,sync,no_subtree_check,no_root_squash)
EOF

# Apply exports
exportfs -ra
systemctl restart nfs-kernel-server
```

**On encoder VMs (NFS clients):**

```bash
# Install NFS client
apt install -y nfs-common

# Mount NFS share
mkdir -p /mnt/downloads
mount proxmox-ip:/mnt/annex/downloads /mnt/downloads

# Make permanent
echo "proxmox-ip:/mnt/annex/downloads /mnt/downloads nfs defaults 0 0" >> /etc/fstab
```

### Bind Mounts for Local Storage

If using local Proxmox storage directly with Docker:

```bash
# Create directory on Proxmox storage
mkdir -p /var/lib/vz/annex/downloads

# Mount in container
docker run -d \
  --name annex \
  -p 8080:80 \
  -v /var/lib/vz/annex/downloads:/downloads \
  -v annex-postgres:/data/postgres \
  -v annex-config:/data/config \
  --restart unless-stopped \
  ghcr.io/wehavenoeyes/annex:latest
```

## Docker Compose Examples

### All-in-One Deployment

Create `/root/annex/docker-compose.yml`:

```yaml
services:
  annex:
    image: ghcr.io/wehavenoeyes/annex:latest
    container_name: annex
    ports:
      - "8080:80"
    volumes:
      - annex-postgres:/data/postgres
      - annex-config:/data/config
      - /mnt/annex/downloads:/downloads
    devices:
      - /dev/dri:/dev/dri
    restart: unless-stopped
    environment:
      - ENCODER_ID=proxmox-main
      - ENCODER_NAME=Proxmox Main Encoder

volumes:
  annex-postgres:
  annex-config:
```

### Production Multi-Container Deployment

For production Proxmox deployments with dedicated encoder containers:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: annex-postgres
    environment:
      - POSTGRES_USER=annex
      - POSTGRES_PASSWORD=secure-password
      - POSTGRES_DB=annex
    volumes:
      - /var/lib/vz/annex/postgres:/var/lib/postgresql/data
    restart: unless-stopped
    networks:
      - annex-net

  server:
    image: ghcr.io/wehavenoeyes/annex-server:latest
    container_name: annex-server
    ports:
      - "8080:3000"
    environment:
      - DATABASE_URL=postgresql://annex:secure-password@postgres:5432/annex
    volumes:
      - /var/lib/vz/annex/config:/data/config
    depends_on:
      - postgres
    restart: unless-stopped
    networks:
      - annex-net

  encoder-gpu1:
    image: ghcr.io/wehavenoeyes/annex-encoder:latest
    container_name: annex-encoder-gpu1
    environment:
      - ANNEX_SERVER_URL=ws://server:3000/encoder
      - ANNEX_ENCODER_ID=proxmox-gpu1
      - ANNEX_ENCODER_NAME=Proxmox Encoder GPU1
      - ANNEX_MAX_CONCURRENT=2
    volumes:
      - /mnt/annex/downloads:/downloads
    devices:
      - /dev/dri:/dev/dri
    depends_on:
      - server
    restart: unless-stopped
    networks:
      - annex-net

  encoder-gpu2:
    image: ghcr.io/wehavenoeyes/annex-encoder:latest
    container_name: annex-encoder-gpu2
    environment:
      - ANNEX_SERVER_URL=ws://server:3000/encoder
      - ANNEX_ENCODER_ID=proxmox-gpu2
      - ANNEX_ENCODER_NAME=Proxmox Encoder GPU2
      - ANNEX_MAX_CONCURRENT=2
    volumes:
      - /mnt/annex/downloads:/downloads
    devices:
      - /dev/dri/renderD129:/dev/dri/renderD128
    depends_on:
      - server
    restart: unless-stopped
    networks:
      - annex-net

networks:
  annex-net:
    driver: bridge
```

Deploy:

```bash
cd /root/annex
docker compose up -d
docker compose logs -f
```

## Network Configuration

### Firewall Rules

Allow traffic to Annex web UI and encoder WebSocket:

```bash
# On Proxmox host firewall
iptables -A INPUT -p tcp --dport 8080 -j ACCEPT

# Or add to /etc/pve/firewall/cluster.fw
[RULES]
IN ACCEPT -p tcp -dport 8080 -source +datacenter
```

### Reverse Proxy with Nginx

To expose Annex on standard ports with SSL:

```bash
# Install nginx on Proxmox
apt install -y nginx certbot python3-certbot-nginx

# Create config
cat > /etc/nginx/sites-available/annex << 'EOF'
server {
    listen 80;
    server_name annex.yourdomain.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

ln -s /etc/nginx/sites-available/annex /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx

# Get SSL certificate
certbot --nginx -d annex.yourdomain.com
```

## Resource Limits

Set resource limits for the Annex container:

```bash
docker run -d \
  --name annex \
  -p 8080:80 \
  --cpus="4" \
  --memory="8g" \
  --memory-swap="8g" \
  -v annex-postgres:/data/postgres \
  -v annex-config:/data/config \
  -v /mnt/annex/downloads:/downloads \
  --restart unless-stopped \
  ghcr.io/wehavenoeyes/annex:latest
```

Or in docker-compose.yml:

```yaml
services:
  annex:
    image: ghcr.io/wehavenoeyes/annex:latest
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 8G
        reservations:
          cpus: '2'
          memory: 4G
```

## Monitoring and Logs

### View Logs

```bash
# Real-time logs
docker logs -f annex

# Last 100 lines
docker logs --tail 100 annex

# Logs since timestamp
docker logs --since 2024-01-01T00:00:00 annex
```

### Container Stats

```bash
docker stats annex
```

### Health Check

```bash
# Check if container is running
docker ps | grep annex

# Check services inside container
docker exec annex ps aux

# Test web UI
curl http://localhost:8080
```

## Backup and Restore

### Automated Backup Script

Create `/root/annex-backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR=/var/backups/annex
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Stop container for consistent backup
docker stop annex

# Backup volumes
docker run --rm \
  -v annex-postgres:/source/postgres \
  -v annex-config:/source/config \
  -v $BACKUP_DIR:/backup \
  alpine tar czf /backup/annex-$DATE.tar.gz /source

# Restart container
docker start annex

# Keep only last 7 backups
find $BACKUP_DIR -name "annex-*.tar.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR/annex-$DATE.tar.gz"
```

Make executable and add to cron:

```bash
chmod +x /root/annex-backup.sh
echo "0 2 * * * /root/annex-backup.sh" | crontab -
```

### Restore from Backup

```bash
# Stop and remove container
docker stop annex
docker rm annex

# Remove old volumes
docker volume rm annex-postgres annex-config

# Restore volumes
docker run --rm \
  -v annex-postgres:/restore/postgres \
  -v annex-config:/restore/config \
  -v /var/backups/annex:/backup \
  alpine tar xzf /backup/annex-YYYYMMDD_HHMMSS.tar.gz -C /restore --strip-components=1

# Start fresh container
docker run -d \
  --name annex \
  -p 8080:80 \
  -v annex-postgres:/data/postgres \
  -v annex-config:/data/config \
  -v /mnt/annex/downloads:/downloads \
  --restart unless-stopped \
  ghcr.io/wehavenoeyes/annex:latest
```

## Updates

### Update to Latest Version

```bash
# Pull latest image
docker pull ghcr.io/wehavenoeyes/annex:latest

# Stop and remove old container
docker stop annex
docker rm annex

# Start new container with same configuration
docker run -d \
  --name annex \
  -p 8080:80 \
  -v annex-postgres:/data/postgres \
  -v annex-config:/data/config \
  -v /mnt/annex/downloads:/downloads \
  --restart unless-stopped \
  ghcr.io/wehavenoeyes/annex:latest
```

With docker-compose:

```bash
cd /root/annex
docker compose pull
docker compose up -d
```

## Troubleshooting

### Container Won't Start

Check logs for errors:

```bash
docker logs annex
```

Common issues:
- Port 8080 already in use: Change `-p 8080:80` to different port
- Permission denied on volumes: Check directory ownership
- Database migration errors: Ensure DATABASE_URL is correct

### GPU Not Detected

Verify GPU is accessible:

```bash
# On Proxmox host
ls -la /dev/dri/

# Inside container
docker exec annex ls -la /dev/dri/

# Check VAAPI support
docker exec annex vainfo --display drm --device /dev/dri/renderD128
```

### Encoder Not Connecting

Verify WebSocket connectivity from encoder node:

```bash
# Test WebSocket endpoint
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: test" \
  http://proxmox-ip:8080/encoder
```

Should return HTTP 101 Switching Protocols.

### Database Connection Failed

If using external PostgreSQL:

```bash
# Test connection from container
docker exec annex psql "$DATABASE_URL" -c "SELECT 1"

# Check PostgreSQL logs on database VM
tail -f /var/log/postgresql/postgresql-*.log
```

### Storage Permission Issues

Fix permissions on shared directories:

```bash
# On Proxmox host
chown -R 1000:1000 /mnt/annex/downloads
chmod -R 755 /mnt/annex/downloads

# Restart container
docker restart annex
```

## Performance Tuning

### PostgreSQL Optimization

For better performance with internal PostgreSQL:

```bash
docker exec -it annex bash

# Edit PostgreSQL config
cat >> /data/postgres/postgresql.conf << EOF
shared_buffers = 2GB
effective_cache_size = 6GB
maintenance_work_mem = 512MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
work_mem = 32MB
EOF

# Restart PostgreSQL
pg_ctl -D /data/postgres restart
```

### NFS Performance

Optimize NFS mount options for better performance:

```bash
# On encoder VMs
umount /mnt/downloads
mount -t nfs -o rw,sync,hard,intr,rsize=8192,wsize=8192 \
  proxmox-ip:/mnt/annex/downloads /mnt/downloads

# Update fstab
sed -i 's|nfs defaults|nfs rw,sync,hard,intr,rsize=8192,wsize=8192|g' /etc/fstab
```

## Additional Resources

- [Main Deployment Guide](deployment.md) - General Docker deployment
- [Encoder Migration Guide](encoder-migration.md) - Upgrading encoders
- [Development Guide](development.md) - Building from source
- [GitHub Repository](https://github.com/WeHaveNoEyes/Annex)
