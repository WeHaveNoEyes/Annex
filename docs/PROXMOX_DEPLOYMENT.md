# Annex Deployment Guide for Proxmox

Complete guide to deploying Annex with dedicated encoding nodes on Proxmox VE.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ Proxmox Host                                                │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  │  Annex Server    │  │  Encoder Node 1  │  │  Encoder Node 2  │
│  │  VM 100          │  │  CT 101          │  │  CT 102          │
│  │                  │  │                  │  │                  │
│  │  - PostgreSQL    │  │  - Intel Arc     │  │  - Intel Arc     │
│  │  - Annex Server  │  │    A310 GPU      │  │    A310 GPU      │
│  │  - qBittorrent   │  │  - FFmpeg VAAPI  │  │  - FFmpeg VAAPI  │
│  │  - Web UI        │  │  - Annex Encoder │  │  - Annex Encoder │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘
│           │                     │                     │          │
│           └─────────────────────┴─────────────────────┘          │
│                          Network Bridge                          │
└─────────────────────────────────────────────────────────────────┘
```

**Note**: Encoder nodes use LXC containers (CT) instead of VMs for better performance and resource efficiency.

## Prerequisites

### Proxmox Host Requirements
- Proxmox VE 8.0 or later
- IOMMU enabled in BIOS (for GPU passthrough)
- Two Intel Arc A310 GPUs in separate IOMMU groups
- Sufficient storage for media downloads and encoded files
- Network access to media storage (NFS/SMB)

### Network Requirements
- Static IP addresses for all VMs
- Access to media storage servers (Plex/Emby)
- Access to indexers (Torznab/Newznab)

---

## Part 1: Proxmox Host Configuration

### 1.1 Enable IOMMU

Edit GRUB configuration:
```bash
nano /etc/default/grub
```

For Intel CPUs, add:
```
GRUB_CMDLINE_LINUX_DEFAULT="quiet intel_iommu=on iommu=pt"
```

For AMD CPUs, add:
```
GRUB_CMDLINE_LINUX_DEFAULT="quiet amd_iommu=on iommu=pt"
```

Update GRUB and reboot:
```bash
update-grub
reboot
```

### 1.2 Configure VFIO Modules

Add required modules:
```bash
echo "vfio" >> /etc/modules
echo "vfio_iommu_type1" >> /etc/modules
echo "vfio_pci" >> /etc/modules
echo "vfio_virqfd" >> /etc/modules
```

Update initramfs:
```bash
update-initramfs -u -k all
reboot
```

### 1.3 Identify GPU PCI IDs

List PCI devices:
```bash
lspci -nn | grep -i intel
```

Example output:
```
01:00.0 VGA compatible controller [0300]: Intel Corporation DG2 [Arc A310] [8086:56a5]
01:00.1 Audio device [0403]: Intel Corporation [8086:56a1]
02:00.0 VGA compatible controller [0300]: Intel Corporation DG2 [Arc A310] [8086:56a5]
02:00.1 Audio device [0403]: Intel Corporation [8086:56a1]
```

Note the PCI addresses (e.g., `01:00.0`, `02:00.0`) and device IDs (e.g., `8086:56a5`).

### 1.4 Verify IOMMU Groups

```bash
#!/bin/bash
shopt -s nullglob
for g in $(find /sys/kernel/iommu_groups/* -maxdepth 0 -type d | sort -V); do
    echo "IOMMU Group ${g##*/}:"
    for d in $g/devices/*; do
        echo -e "\t$(lspci -nns ${d##*/})"
    done;
done;
```

Ensure each GPU (including audio) is in a separate IOMMU group.

### 1.5 Load Required Kernel Modules for LXC GPU Passthrough

For LXC containers, we need to ensure Intel GPU drivers are loaded on the host:

```bash
# Load Intel GPU modules on host
echo "i915" >> /etc/modules

# Update initramfs
update-initramfs -u -k all

# Reboot to load modules
reboot
```

### 1.6 Verify GPU Devices on Proxmox Host

After reboot, verify GPUs are visible:

```bash
# List all DRI devices
ls -la /dev/dri/

# Expected output:
# card0 -> First GPU
# card1 -> Second GPU
# renderD128 -> First GPU render node
# renderD129 -> Second GPU render node
```

### 1.7 Map GPU PCI Addresses to Render Devices

This is critical for knowing which render device to pass to each container:

```bash
# Show detailed mapping
ls -la /dev/dri/by-path/

# Example output:
# pci-0000:01:00.0-card -> ../card0
# pci-0000:01:00.0-render -> ../renderD128
# pci-0000:02:00.0-card -> ../card1
# pci-0000:02:00.0-render -> ../renderD129
```

**Record this mapping!** You'll need it when configuring containers:
- GPU at PCI 01:00.0 → renderD128 → CT 101
- GPU at PCI 02:00.0 → renderD129 → CT 102

### 1.8 Get Device Major/Minor Numbers

Find the character device numbers for cgroup permissions:

```bash
# Get render device numbers
ls -l /dev/dri/renderD128
# Output: crw-rw---- 1 root render 226, 128 Dec 31 12:00 /dev/dri/renderD128
#                                   ^^^ ^^^
#                                   major minor

ls -l /dev/dri/renderD129
# Output: crw-rw---- 1 root render 226, 129 Dec 31 12:00 /dev/dri/renderD129
#                                   ^^^ ^^^
#                                   major minor
```

The major number is typically **226** for DRI devices. Minor numbers:
- renderD128 = **128**
- renderD129 = **129**

### 1.9 Set Permissions (Optional but Recommended)

Ensure render devices are accessible:

```bash
# Add udev rule for persistent permissions
cat > /etc/udev/rules.d/70-intel-gpu.rules <<EOF
SUBSYSTEM=="drm", KERNEL=="renderD*", GROUP="render", MODE="0666"
EOF

# Reload udev rules
udevadm control --reload-rules
udevadm trigger

# Verify permissions
ls -la /dev/dri/renderD*
# Should show: crw-rw-rw- (666 permissions)
```

---

## Part 2: VM/CT Specifications

### VM 100: Annex Server

**Type**: Virtual Machine (VM)
**Operating System**: Ubuntu 24.04 LTS Server

**Specifications**:
- **CPU**: 4 cores (host type)
- **RAM**: 8 GB
- **Storage**:
  - Boot disk: 40 GB (thin provisioned)
  - Media storage: Mount NFS/SMB shares or pass through large volume
- **Network**: Bridge to main network (static IP recommended)
- **Notes**: No GPU required

### CT 101 & 102: Encoder Nodes

**Type**: LXC Container (CT)
**Operating System**: Ubuntu 24.04 LTS (container template)

**Specifications** (each):
- **CPU**: 4 cores
- **RAM**: 4 GB
- **Storage**: 20 GB (thin provisioned)
- **Network**: Bridge to main network (static IP recommended)
- **GPU**: Intel Arc A310 (device passthrough)
- **Privileges**: Unprivileged container with device access
- **Notes**: Needs access to same media storage as server

**Why Containers?**
- 50% less overhead than VMs
- Faster startup and better resource utilization
- Direct GPU access without VFIO complexity
- Easier backup and migration

---

## Part 3: Create VMs in Proxmox

### 3.1 Create Annex Server VM (VM 100)

Using Proxmox web UI:

1. **Create VM**:
   - VM ID: 100
   - Name: annex-server
   - OS: Ubuntu 24.04 LTS ISO
   - System: Default (UEFI optional)
   - Disks: 40 GB
   - CPU: 4 cores, type=host
   - Memory: 8192 MB
   - Network: vmbr0

2. **Install Ubuntu**:
   - Boot VM and follow Ubuntu installer
   - Hostname: annex-server
   - Install OpenSSH server
   - No additional packages

3. **Post-install**:
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

### 3.2 Create Encoder Node Containers (CT 101 & 102)

Repeat for both encoder nodes:

1. **Download Ubuntu 24.04 Template**:
   ```bash
   # On Proxmox host
   pveam update
   pveam download local ubuntu-24.04-standard_24.04-2_amd64.tar.zst
   ```

2. **Create Container via CLI**:

   **For CT 101 (first encoder with GPU at 01:00)**:
   ```bash
   pct create 101 local:vztmpl/ubuntu-24.04-standard_24.04-2_amd64.tar.zst \
     --hostname annex-encoder-1 \
     --cores 4 \
     --memory 4096 \
     --swap 512 \
     --net0 name=eth0,bridge=vmbr0,ip=dhcp \
     --storage local-lvm \
     --rootfs local-lvm:20 \
     --unprivileged 1 \
     --features nesting=1
   ```

   **For CT 102 (second encoder with GPU at 02:00)**:
   ```bash
   pct create 102 local:vztmpl/ubuntu-24.04-standard_24.04-2_amd64.tar.zst \
     --hostname annex-encoder-2 \
     --cores 4 \
     --memory 4096 \
     --swap 512 \
     --net0 name=eth0,bridge=vmbr0,ip=dhcp \
     --storage local-lvm \
     --rootfs local-lvm:20 \
     --unprivileged 1 \
     --features nesting=1
   ```

3. **Configure GPU Passthrough**:

   **IMPORTANT**: Use the mapping you recorded in Part 1.7. Here's a reference:

   ```bash
   # On Proxmox host, verify your GPU mapping
   ls -la /dev/dri/by-path/
   ```

   **Quick Reference Table**:
   | PCI Address | Render Device | Card Device | Container | Minor # |
   |-------------|---------------|-------------|-----------|---------|
   | 01:00.0     | renderD128    | card0       | CT 101    | 128     |
   | 02:00.0     | renderD129    | card1       | CT 102    | 129     |

   Add GPU devices to containers using the correct minor numbers:

   ```bash
   # For CT 101 (first GPU: 01:00.0 → renderD128, minor=128)
   echo "lxc.cgroup2.devices.allow: c 226:128 rwm" >> /etc/pve/lxc/101.conf
   echo "lxc.mount.entry: /dev/dri/renderD128 dev/dri/renderD128 none bind,optional,create=file" >> /etc/pve/lxc/101.conf
   echo "lxc.mount.entry: /dev/dri/card0 dev/dri/card0 none bind,optional,create=file" >> /etc/pve/lxc/101.conf

   # For CT 102 (second GPU: 02:00.0 → renderD129, minor=129)
   echo "lxc.cgroup2.devices.allow: c 226:129 rwm" >> /etc/pve/lxc/102.conf
   echo "lxc.mount.entry: /dev/dri/renderD129 dev/dri/renderD129 none bind,optional,create=file" >> /etc/pve/lxc/102.conf
   echo "lxc.mount.entry: /dev/dri/card1 dev/dri/card1 none bind,optional,create=file" >> /etc/pve/lxc/102.conf
   ```

   **Understanding the configuration**:
   - `lxc.cgroup2.devices.allow: c 226:128 rwm` - Allow container to access character device (major 226, minor 128) with read/write/mknod permissions
   - `lxc.mount.entry:` - Bind mount the device from host to container
   - Adjust minor numbers (128, 129) if your GPUs have different render devices

4. **Start Containers**:
   ```bash
   pct start 101
   pct start 102
   ```

5. **Enter Container and Set Root Password**:
   ```bash
   # For CT 101
   pct enter 101
   passwd root
   exit

   # For CT 102
   pct enter 102
   passwd root
   exit
   ```

6. **Verify GPU Access**:
   ```bash
   pct enter 101
   ls -la /dev/dri/
   # Should show renderD128 (or your GPU device)
   exit
   ```

---

## Part 4: Configure Shared Storage

All VMs need access to the same media paths for downloads and encoding.

### Option A: NFS Shares (Recommended)

**On Proxmox host or NAS**:
```bash
# Example NFS exports
/mnt/media/downloads  *(rw,sync,no_subtree_check,no_root_squash)
/mnt/media/completed  *(rw,sync,no_subtree_check,no_root_squash)
```

**On all VMs**:
```bash
# Install NFS client
sudo apt install nfs-common

# Create mount points
sudo mkdir -p /media/downloads
sudo mkdir -p /media/completed

# Add to /etc/fstab
echo "192.168.1.100:/mnt/media/downloads /media/downloads nfs defaults,_netdev 0 0" | sudo tee -a /etc/fstab
echo "192.168.1.100:/mnt/media/completed /media/completed nfs defaults,_netdev 0 0" | sudo tee -a /etc/fstab

# Mount
sudo mount -a
```

### Option B: Bind Mounts (Containers Only)

**On Proxmox host**:
```bash
# Add bind mount to container configs
# For server VM (if using container instead)
# pct set 100 -mp0 /mnt/media,mp=/media

# For encoder containers
pct set 101 -mp0 /mnt/media,mp=/media
pct set 102 -mp0 /mnt/media,mp=/media

# Then restart containers
pct restart 101
pct restart 102
```

**Note**: Bind mounts are only available for LXC containers, not VMs.

---

## Part 5: Install Annex Server (VM 100)

### 5.1 Install Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# Install PostgreSQL
sudo apt install postgresql postgresql-contrib -y

# Install Git
sudo apt install git -y
```

### 5.2 Configure PostgreSQL

```bash
# Switch to postgres user
sudo -u postgres psql

# Create database and user
CREATE DATABASE annex;
CREATE USER annex WITH ENCRYPTED PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE annex TO annex;
\q
```

### 5.3 Clone and Setup Annex

```bash
# Clone repository
cd ~
git clone https://github.com/annex-to/annex.git
cd annex

# Install dependencies
bun install

# Create .env file
cat > packages/server/.env <<EOF
DATABASE_URL="postgresql://annex:your-secure-password@localhost:5432/annex"
PORT=3000

# TMDB API Key (get from https://www.themoviedb.org/settings/api)
TMDB_API_KEY=your_tmdb_key

# MDBList API Key (get from https://mdblist.com/api)
ANNEX_MDBLIST_API_KEY=your_mdblist_key

# qBittorrent
QBITTORRENT_URL=http://localhost:8080
QBITTORRENT_USERNAME=admin
QBITTORRENT_PASSWORD=adminadmin

# Encoder path translation
ENCODER_SERVER_DOWNLOADS_PATH=/media/downloads
ENCODER_REMOTE_DOWNLOADS_PATH=/media/downloads
ENCODER_SERVER_COMPLETED_PATH=/media/completed
ENCODER_REMOTE_COMPLETED_PATH=/media/completed
EOF

# Run database migrations
cd packages/server
bunx prisma migrate deploy
bunx prisma generate

# Build
cd ~/annex
bun run build
```

### 5.4 Install qBittorrent

```bash
# Add PPA
sudo add-apt-repository ppa:qbittorrent-team/qbittorrent-stable -y
sudo apt update

# Install qBittorrent-nox
sudo apt install qbittorrent-nox -y

# Create systemd service
sudo cat > /etc/systemd/system/qbittorrent.service <<EOF
[Unit]
Description=qBittorrent-nox
After=network.target

[Service]
Type=forking
User=$(whoami)
ExecStart=/usr/bin/qbittorrent-nox -d --webui-port=8080
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable qbittorrent
sudo systemctl start qbittorrent
```

Configure qBittorrent:
- Access: http://VM_IP:8080
- Default login: admin/adminadmin
- Settings → Downloads → Save path: `/media/downloads`
- Settings → Downloads → Keep incomplete in: `/media/downloads/incomplete`
- Settings → Downloads → Move completed to: `/media/completed`

### 5.5 Create Annex Systemd Service

```bash
sudo cat > /etc/systemd/system/annex.service <<EOF
[Unit]
Description=Annex Media Server
After=network.target postgresql.service

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=/home/$(whoami)/annex/packages/server
ExecStart=/home/$(whoami)/.bun/bin/bun run --env-file=.env src/index.ts
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable annex
sudo systemctl start annex
```

### 5.6 Verify Installation

```bash
# Check service status
sudo systemctl status annex

# Check logs
journalctl -u annex -f

# Test web interface
curl http://localhost:3000
```

Access Annex UI: `http://VM_IP:3000`

---

## Part 6: Install Encoder Nodes (CT 101 & 102)

Run these steps on BOTH encoder containers. Enter each container:
```bash
pct enter 101  # or 102 for second encoder
```

### 6.1 Initial Setup

```bash
# Update system
apt update && apt upgrade -y

# Install basic tools
apt install -y curl wget gnupg2 software-properties-common
```

### 6.2 Install Intel GPU Drivers

**Note**: Containers inherit kernel modules from the Proxmox host, so we only need userspace drivers.

```bash
# Add Intel GPU repository
wget -qO - https://repositories.intel.com/gpu/intel-graphics.key | \
  gpg --yes --dearmor --output /usr/share/keyrings/intel-graphics.gpg

echo "deb [arch=amd64 signed-by=/usr/share/keyrings/intel-graphics.gpg] https://repositories.intel.com/gpu/ubuntu noble client" | \
  tee /etc/apt/sources.list.d/intel-gpu-noble.list

apt update

# Install userspace drivers and VA-API
apt install -y \
  intel-media-va-driver-non-free \
  libmfx1 \
  libmfxgen1 \
  libvpl2 \
  libegl-mesa0 \
  libegl1-mesa \
  libgbm1 \
  libgl1-mesa-dri \
  libglapi-mesa \
  libglx-mesa0 \
  libigdgmm12 \
  mesa-va-drivers \
  mesa-vdpau-drivers \
  mesa-vulkan-drivers \
  va-driver-all \
  vainfo

# No reboot needed for containers
```

### 6.3 Verify GPU Access

```bash
# Check GPU device
ls -la /dev/dri/
# Should show renderD128 (or renderD129 for second encoder)

# Check VA-API
# For CT 101 (renderD128)
vainfo --display drm --device /dev/dri/renderD128

# For CT 102 (renderD129)
vainfo --display drm --device /dev/dri/renderD129

# Should show Intel Arc A310 with AV1 encoding support
# Look for: VAProfileAV1Profile0 : VAEntrypointEncSlice
```

**Troubleshooting GPU Access**:
If `vainfo` shows errors, ensure the device numbers match your configuration:
```bash
# On Proxmox host, verify GPU-to-renderD mapping
ls -la /dev/dri/by-path/
# Match PCI addresses (01:00.0, 02:00.0) to renderD devices
```

### 6.4 Install FFmpeg with VAAPI

```bash
# Install FFmpeg
apt install -y ffmpeg

# Verify VAAPI support
ffmpeg -hwaccels
# Should list 'vaapi'

# Test encoding (adjust renderD device for second encoder)
# For CT 101:
ffmpeg -hwaccel vaapi -hwaccel_device /dev/dri/renderD128 -hwaccel_output_format vaapi \
  -f lavfi -i testsrc=duration=5:size=1920x1080:rate=30 \
  -vf 'format=nv12,hwupload' -c:v av1_vaapi -t 5 -f null -

# For CT 102:
ffmpeg -hwaccel vaapi -hwaccel_device /dev/dri/renderD129 -hwaccel_output_format vaapi \
  -f lavfi -i testsrc=duration=5:size=1920x1080:rate=30 \
  -vf 'format=nv12,hwupload' -c:v av1_vaapi -t 5 -f null -

# Should complete without errors
```

### 6.5 Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
export BUN_INSTALL="/root/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# Verify
bun --version
```

### 6.6 Install Annex Encoder

```bash
# Download encoder binary
curl -L -o annex-encoder \
  https://github.com/annex-to/annex/releases/latest/download/annex-encoder-linux-x64

chmod +x annex-encoder

# Move to /usr/local/bin
mv annex-encoder /usr/local/bin/

# Verify
annex-encoder --version
```

### 6.7 Configure Encoder

```bash
# Create config directory
mkdir -p /etc/annex-encoder

# Create environment file
# For CT 101 (first encoder):
cat > /etc/annex-encoder.env <<EOF
# Annex server WebSocket URL (adjust IP to your server)
ANNEX_SERVER_URL=ws://192.168.1.100:3000/encoder

# Encoder identification
ENCODER_NAME=encoder-1
ENCODER_ID=auto

# Path translation (must match server paths via NFS)
ENCODER_SERVER_DOWNLOADS_PATH=/media/downloads
ENCODER_REMOTE_DOWNLOADS_PATH=/media/downloads
ENCODER_SERVER_COMPLETED_PATH=/media/completed
ENCODER_REMOTE_COMPLETED_PATH=/media/completed

# Hardware acceleration (renderD128 for first GPU)
VAAPI_DEVICE=/dev/dri/renderD128

# Logging
LOG_LEVEL=info
EOF

# For CT 102 (second encoder), use:
# ENCODER_NAME=encoder-2
# VAAPI_DEVICE=/dev/dri/renderD129
```

### 6.8 Create Encoder Systemd Service

```bash
cat > /etc/systemd/system/annex-encoder.service <<EOF
[Unit]
Description=Annex Encoder Node
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
EnvironmentFile=/etc/annex-encoder.env
ExecStart=/usr/local/bin/annex-encoder
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable annex-encoder
systemctl start annex-encoder
```

### 6.9 Verify Encoder Connection

```bash
# Check service
systemctl status annex-encoder

# Check logs
journalctl -u annex-encoder -f

# Should see: "Connected to Annex server" and "GPU: Intel Arc A310"

# Exit container
exit
```

---

## Part 7: Configure Annex

Access Annex UI at `http://VM_IP:3000` and configure:

### 7.1 Add Storage Servers

Settings → Storage Servers:
- Add your Plex/Emby servers
- Configure paths for movie and TV delivery
- Set quality preferences (max resolution, bitrate)

### 7.2 Add Indexers

Settings → Indexers:
- Add Torznab/Newznab indexers
- Configure API keys and categories

### 7.3 Verify Encoders

Settings → Encoders:
- Should show 2 connected encoders:
  - encoder-1 (IDLE)
  - encoder-2 (IDLE)

---

## Part 8: Testing

### 8.1 Test Download

1. Search for a movie in Annex
2. Request download
3. Verify file appears in `/media/completed`

### 8.2 Test Encoding

1. Request should automatically queue encoding
2. Check encoder status (should show ENCODING)
3. Monitor progress in Annex UI
4. Verify encoded file is created
5. Check both encoders are being utilized

### 8.3 Monitor Logs

**Server logs**:
```bash
journalctl -u annex -f
```

**Encoder logs**:
```bash
# On encoder VMs
journalctl -u annex-encoder -f
```

**qBittorrent logs**:
```bash
journalctl -u qbittorrent -f
```

---

## Part 9: Performance Tuning

### 9.1 PostgreSQL Optimization

Edit `/etc/postgresql/16/main/postgresql.conf`:
```
shared_buffers = 2GB
effective_cache_size = 6GB
maintenance_work_mem = 512MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = 10MB
min_wal_size = 1GB
max_wal_size = 4GB
```

Restart PostgreSQL:
```bash
sudo systemctl restart postgresql
```

### 9.2 Encoder Concurrency

Each encoder can handle 1 encode job at a time. With 2 encoders, you can process 2 files simultaneously.

To add more encoding capacity, create additional encoder VMs with GPUs.

### 9.3 Network Optimization

For NFS performance:
```bash
# In /etc/fstab, add these options:
nfs defaults,_netdev,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2 0 0
```

---

## Part 10: Backup & Maintenance

### 10.1 Backup Database

```bash
# Create backup script
cat > ~/backup-annex-db.sh <<'EOF'
#!/bin/bash
BACKUP_DIR="/backup/annex"
mkdir -p $BACKUP_DIR
pg_dump -U annex annex > $BACKUP_DIR/annex-$(date +%Y%m%d-%H%M%S).sql
# Keep only last 7 backups
ls -t $BACKUP_DIR/annex-*.sql | tail -n +8 | xargs rm -f
EOF

chmod +x ~/backup-annex-db.sh

# Add to crontab (daily at 3 AM)
(crontab -l 2>/dev/null; echo "0 3 * * * /home/$(whoami)/backup-annex-db.sh") | crontab -
```

### 10.2 Update Annex

```bash
# On server VM
cd ~/annex
git pull
bun install
bun run build
sudo systemctl restart annex
```

### 10.3 Update Encoders

```bash
# On encoder VMs
sudo /usr/local/bin/annex-encoder --update
sudo systemctl restart annex-encoder
```

---

## Troubleshooting

### GPU Not Detected in Encoder Container

```bash
# From Proxmox host: Check which GPU is which
ls -la /dev/dri/by-path/
# Example output:
# pci-0000:01:00.0-card -> ../card0
# pci-0000:01:00.0-render -> ../renderD128
# pci-0000:02:00.0-card -> ../card1
# pci-0000:02:00.0-render -> ../renderD129

# Inside container: Check render device exists
ls -la /dev/dri/

# Test VA-API access
vainfo --display drm --device /dev/dri/renderD128

# If device not found, check container config
cat /etc/pve/lxc/101.conf
# Should contain lxc.cgroup2.devices.allow and lxc.mount.entry lines

# Fix permissions if needed
chmod 666 /dev/dri/renderD*
```

### Encoder Not Connecting

```bash
# Enter container
pct enter 101

# Check network connectivity
ping <server-ip>

# Check WebSocket port
apt install -y telnet
telnet <server-ip> 3000

# Check encoder logs
journalctl -u annex-encoder -n 100

# Verify environment variables
cat /etc/annex-encoder.env

# Restart encoder service
systemctl restart annex-encoder

exit
```

### NFS Mount Issues

```bash
# Test NFS mount
sudo mount -t nfs <nfs-server>:/path /media/downloads

# Check NFS services
sudo systemctl status nfs-client.target

# Debug mount
sudo mount -vvv <nfs-server>:/path /media/downloads
```

### Encoding Failures

```bash
# Enter container
pct enter 101

# Check encoder logs
journalctl -u annex-encoder -f

# Test FFmpeg directly (adjust renderD device)
ffmpeg -hwaccel vaapi -hwaccel_device /dev/dri/renderD128 \
  -f lavfi -i testsrc=duration=10:size=1920x1080:rate=30 \
  -vf 'format=nv12,hwupload' -c:v av1_vaapi /tmp/test-output.mkv

# If real file test needed (ensure file exists)
# ffmpeg -hwaccel vaapi -hwaccel_device /dev/dri/renderD128 \
#   -i /media/completed/test.mkv \
#   -c:v av1_vaapi -c:a copy /tmp/test-output.mkv

# Check GPU usage from Proxmox host
intel_gpu_top

exit
```

---

## Resource Allocation Summary

| ID | Type | CPU | RAM | Storage | GPU | Purpose |
|----|------|-----|-----|---------|-----|---------|
| 100 | VM | 4 cores | 8 GB | 40 GB + NFS | None | Main server |
| 101 | CT | 4 cores | 4 GB | 20 GB + NFS | Arc A310 | Encoder 1 |
| 102 | CT | 4 cores | 4 GB | 20 GB + NFS | Arc A310 | Encoder 2 |

**Total**: 12 CPU cores, 16 GB RAM, 80 GB storage + shared NFS

**Performance Benefits of LXC Containers**:
- ~50% less RAM overhead compared to VMs
- Faster startup (5s vs 30s)
- Better I/O performance
- Shared kernel with host (less maintenance)

---

## Security Recommendations

1. **Firewall**: Only expose port 3000 (Annex UI) externally
2. **Authentication**: Configure reverse proxy with auth (Nginx/Caddy)
3. **SSL**: Use Let's Encrypt for HTTPS
4. **Updates**: Enable automatic security updates
   ```bash
   sudo apt install unattended-upgrades
   sudo dpkg-reconfigure -plow unattended-upgrades
   ```

---

## Scaling

To add more encoding capacity:

1. Add more Intel Arc GPUs to Proxmox host
2. Create new encoder container (CT 103, 104, etc.)
3. Configure GPU device passthrough in container config
4. Install encoder software
5. Encoders auto-register with server

**Example for CT 103**:
```bash
# Create container
pct create 103 local:vztmpl/ubuntu-24.04-standard_24.04-2_amd64.tar.zst \
  --hostname annex-encoder-3 \
  --cores 4 --memory 4096 --swap 512 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --storage local-lvm --rootfs local-lvm:20 \
  --unprivileged 1 --features nesting=1

# Add GPU (adjust renderD number for third GPU)
echo "lxc.cgroup2.devices.allow: c 226:130 rwm" >> /etc/pve/lxc/103.conf
echo "lxc.mount.entry: /dev/dri/renderD130 dev/dri/renderD130 none bind,optional,create=file" >> /etc/pve/lxc/103.conf

# Start and configure
pct start 103
# Follow Part 6 installation steps
```

Each encoder processes 1 file at a time. For 4K content on Arc A310:
- Average encode time: 0.5-1x realtime
- Example: 2-hour movie = 2-4 hours encoding

With 2 encoders: ~4-8 movies per day (assuming 2-hour movies)

---

## Next Steps

After deployment:
1. Configure indexers for your preferred trackers
2. Add storage servers (Plex/Emby)
3. Set up library sync schedules
4. Configure quality profiles
5. Request your first media!

For support and updates, visit: https://github.com/annex-to/annex
