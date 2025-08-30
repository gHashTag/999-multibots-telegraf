# Self-Hosted GitHub Actions Runner Setup

## 🏠 Free Alternative: Self-Hosted Runner

Instead of using GitHub's paid runners, you can run GitHub Actions on your own server for free.

### Setup Instructions:

1. **On your production server (185.161.67.53):**

```bash
# Create runner directory
mkdir -p /opt/github-runner
cd /opt/github-runner

# Download the latest runner
curl -o actions-runner-linux-x64-2.311.0.tar.gz -L https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-linux-x64-2.311.0.tar.gz

# Extract the installer
tar xzf ./actions-runner-linux-x64-2.311.0.tar.gz

# Configure the runner (you'll get these values from GitHub)
./config.sh --url https://github.com/gHashTag/999-multibots-telegraf --token YOUR_TOKEN

# Install as a service
sudo ./svc.sh install
sudo ./svc.sh start
```

2. **Get registration token from GitHub:**
   - Go to: https://github.com/gHashTag/999-multibots-telegraf/settings/actions/runners
   - Click "New self-hosted runner"
   - Copy the token and use it in the config command

### Benefits:
- ✅ **Completely Free** - No GitHub Actions billing
- ✅ **Runs on your server** - Direct access to production environment
- ✅ **Faster deployment** - No external network delays
- ✅ **Full control** - Your server, your rules

### Updated Workflow:
The existing `.github/workflows/production-deploy.yml` will work exactly the same, but run on your server instead of GitHub's paid runners.