# Cardigann Indexers - User Guide

Annex supports Cardigann indexers, which allows you to use hundreds of torrent indexers through YAML definitions from the Prowlarr project.

## What is Cardigann?

Cardigann is a standard for defining torrent indexer configurations using YAML files. Instead of writing custom code for each indexer, you can use a simple configuration file that describes how to search and parse results from any indexer.

Annex includes:
- **500+ indexer definitions** from Prowlarr's repository
- **Automatic sync** from GitHub to get new/updated definitions
- **Full search support** for movies and TV shows
- **Rate limiting** to respect indexer limits
- **Category mapping** to Torznab categories

## Getting Started

### 1. Browse Available Indexers

Navigate to **Settings → Indexers** and click **Browse Cardigann**.

You'll see a list of available indexer definitions with:
- **Language** (English, French, Russian, etc.)
- **Type** (public, private, semi-private)
- **Capabilities** (Movies, TV shows, or both)

Use the search and filter options to find indexers for your region or type.

### 2. Sync Definitions

Click **Sync Definitions** to download the latest indexer definitions from Prowlarr's GitHub repository. This:
- Downloads all available YAML definition files
- Updates existing definitions with new versions
- Shows you how many were added or updated

**Recommended**: Sync definitions periodically to get new indexers and bug fixes.

### 3. Add an Indexer

Click **Add Indexer** next to any definition to configure it:

#### Basic Information
- **Indexer Name**: A friendly name (defaults to definition name)
- **Priority**: 1-100, higher = searched first (default: 50)
- **Enabled**: Whether to include in searches

#### Indexer Settings
Each indexer may require different settings:
- **Username/Password**: Login credentials for private trackers
- **API Key**: Some indexers use API keys instead
- **Cookies**: Session cookies for authentication
- **Custom fields**: Indexer-specific configuration

**Note**: Settings are defined in the YAML definition and vary by indexer.

#### Categories
Configure which Torznab categories to search:

**Movie Categories** (if supported):
- `2000` - Movies
- `2010` - Movies/Foreign
- `2020` - Movies/Other
- `2030` - Movies/SD
- `2040` - Movies/HD
- `2045` - Movies/UHD
- `2050` - Movies/BluRay
- `2060` - Movies/3D

**TV Categories** (if supported):
- `5000` - TV
- `5020` - TV/Foreign
- `5030` - TV/SD
- `5040` - TV/HD
- `5045` - TV/UHD
- `5050` - TV/Other
- `5060` - TV/Sport
- `5070` - TV/Anime
- `5080` - TV/Documentary

The form shows which categories the indexer supports. You can customize which ones to search.

#### Rate Limiting
To avoid hitting API limits:
- **Enable rate limiting**: Turn on request limiting
- **Max Requests**: Maximum requests allowed
- **Window (seconds)**: Time window for the limit

Example: 10 requests per 60 seconds = max 10 API calls per minute

### 4. Edit an Indexer

In the main **Indexers** list, Cardigann indexers appear alongside other types.

Click **Edit** to:
- Update credentials or settings
- Change categories or priority
- Enable/disable the indexer
- Adjust rate limiting

### 5. Delete an Indexer

Click **Delete** to remove an indexer configuration. This only removes your configuration, not the definition (you can add it again later).

## How Searches Work

When you request media in Annex:

1. **Priority Order**: Indexers are searched in priority order (highest first)
2. **Category Filtering**: Only configured categories are searched
3. **Rate Limiting**: Requests are throttled if rate limiting is enabled
4. **Result Parsing**: Cardigann parses HTML/JSON responses into standard format
5. **Quality Detection**: Title is parsed for resolution, source, codec
6. **Scoring**: Results are scored based on quality and seeder count

## Troubleshooting

### Indexer Returns No Results

**Check Settings**:
- Verify credentials are correct
- Test login on the indexer's website
- Check if indexer requires VPN or specific region

**Check Categories**:
- Ensure categories are configured
- Try adding more categories
- Verify indexer supports the category

**Use Test Function**:
- Click **Test** in the edit form
- Review the test results
- Check for error messages

### Authentication Errors

**Private Trackers**:
- Username and password must be exact
- Some require cookies instead of credentials
- Check if account is active/not banned

**API Keys**:
- Regenerate API key on indexer website
- Copy entire key without spaces
- Some expire and need renewal

### Rate Limit Errors

If you see "rate limit exceeded":
- Reduce max requests or increase window
- Enable rate limiting if disabled
- Wait for the time window to reset
- Check indexer's actual rate limits

### Definition Not Working

Indexer websites change frequently. If a definition stops working:
- **Sync Definitions**: Get the latest updates
- **Check GitHub**: Visit Prowlarr/Indexers repository for known issues
- **Report Issue**: If still broken, report to Prowlarr project

## Best Practices

### For Public Trackers
- Use moderate rate limiting (10 req/60s)
- Set priority lower than private trackers (30-40)
- Enable only needed categories
- Monitor for IP bans

### For Private Trackers
- Use conservative rate limiting (5 req/60s)
- Set priority high (60-80)
- Keep credentials secure
- Respect tracker rules
- Monitor ratio requirements

### For Performance
- Enable only indexers you need
- Disable slow or unreliable indexers
- Use specific categories instead of "all"
- Set appropriate priorities
- Monitor search times in logs

## Advanced Configuration

### Multiple Instances

You can add the same definition multiple times with different settings:
- Different language versions of an indexer
- Different category configurations
- Different rate limits for different use cases

Give each a unique name like "Indexer (Movies)" and "Indexer (TV)".

### Category Customization

If an indexer supports custom categories not shown:
- Check the YAML definition for available categories
- Manual entry in comma-separated format: `2000, 2010, 2040`

### Manual Definitions

Advanced users can create custom definitions:
1. Create a YAML file in `data/cardigann-definitions/`
2. Follow the Cardigann specification format
3. Restart Annex to load the definition
4. Add the indexer through the UI

See **Developer Documentation** for YAML specification details.

## FAQ

**Q: How many indexers can I add?**
A: No limit, but more indexers = slower searches. Use 5-15 quality indexers.

**Q: Will this affect my ratio on private trackers?**
A: Downloads affect ratio, but searches don't. Use rate limiting to be respectful.

**Q: Can I use this without Prowlarr?**
A: Yes! Annex has its own Cardigann implementation. No Prowlarr needed.

**Q: How often should I sync definitions?**
A: Weekly or monthly is fine. Sync when you notice issues or want new indexers.

**Q: Are API keys stored securely?**
A: Yes, settings are stored in the database. Use proper database security.

**Q: Can I contribute new indexers?**
A: Yes! Contribute to the Prowlarr/Indexers repository on GitHub.

## Getting Help

- **Logs**: Check server logs for detailed error messages
- **Test Function**: Use the built-in test to diagnose issues
- **GitHub Issues**: Report bugs to Annex repository
- **Indexer Issues**: Report broken definitions to Prowlarr repository
