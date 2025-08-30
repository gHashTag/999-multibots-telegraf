#!/usr/bin/env node

/**
 * GitHub Webhook Deployment Server
 * Free alternative to GitHub Actions - runs on your server
 * Automatically deploys when you push to production branch
 */

const express = require('express');
const { exec } = require('child_process');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = 9000;
const SECRET = process.env.GITHUB_WEBHOOK_SECRET || 'your-webhook-secret';
const REPO_PATH = '/root/999-agents-vibecoder';

// Middleware
app.use(express.json());

// Verify GitHub webhook signature
function verifySignature(payload, signature) {
    const hmac = crypto.createHmac('sha256', SECRET);
    hmac.update(payload);
    const digest = 'sha256=' + hmac.digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

// Execute shell command
function execCommand(command, cwd = REPO_PATH) {
    return new Promise((resolve, reject) => {
        exec(command, { cwd }, (error, stdout, stderr) => {
            if (error) {
                reject({ error, stdout, stderr });
            } else {
                resolve({ stdout, stderr });
            }
        });
    });
}

// Deployment function
async function deployProduction() {
    console.log('🚀 Starting production deployment...');
    
    try {
        // Step 1: Pull latest changes
        console.log('📥 Pulling latest changes...');
        await execCommand('git fetch origin && git pull origin main');
        
        // Step 2: Run deployment script
        console.log('🔧 Running deployment script...');
        await execCommand('./scripts/deploy-production.sh');
        
        // Step 3: Setup webhooks
        console.log('🔗 Setting up webhooks...');
        await execCommand(`
            for i in {1..6}; do
                TOKEN=$(docker exec 999-multibots printenv | grep "BOT_TOKEN_$i=" | cut -d'=' -f2)
                if [ ! -z "$TOKEN" ]; then
                    curl -X POST "https://api.telegram.org/bot$TOKEN/setWebhook" \\
                         -d "url=http://test-render-farm.ru/webhook/bot$i" \\
                         -d "allowed_updates=[\\"message\\",\\"callback_query\\",\\"pre_checkout_query\\"]"
                fi
            done
        `);
        
        console.log('✅ Deployment completed successfully!');
        return { success: true, message: 'Deployment completed' };
        
    } catch (error) {
        console.error('❌ Deployment failed:', error);
        return { success: false, error: error.message };
    }
}

// Webhook endpoint
app.post('/webhook/github', async (req, res) => {
    const signature = req.get('X-Hub-Signature-256');
    const payload = JSON.stringify(req.body);
    
    // Verify signature
    if (!signature || !verifySignature(payload, signature)) {
        return res.status(401).json({ error: 'Invalid signature' });
    }
    
    const { ref, repository, commits } = req.body;
    
    // Only deploy on push to production branch
    if (ref === 'refs/heads/production') {
        console.log(`📦 Received push to production branch from ${repository.full_name}`);
        console.log(`📝 ${commits.length} commits received`);
        
        // Start deployment (don't wait for completion)
        deployProduction()
            .then(result => {
                console.log('🎉 Deployment result:', result);
            })
            .catch(error => {
                console.error('💥 Deployment error:', error);
            });
        
        res.json({ 
            status: 'deployment_started',
            message: 'Production deployment initiated',
            branch: 'production',
            commits: commits.length
        });
    } else {
        res.json({ 
            status: 'ignored',
            message: `Push to ${ref} ignored (only production branch triggers deployment)`
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        service: 'github-webhook-deployer',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Status endpoint
app.get('/status', async (req, res) => {
    try {
        const containerStatus = await execCommand('docker ps | grep 999-multibots');
        res.json({
            status: 'operational',
            container: 'running',
            details: containerStatus.stdout.trim()
        });
    } catch (error) {
        res.json({
            status: 'error',
            container: 'not_running',
            error: error.message
        });
    }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🎣 GitHub Webhook Deployment Server running on port ${PORT}`);
    console.log(`📡 Webhook URL: http://185.161.67.53:${PORT}/webhook/github`);
    console.log(`🔐 Using webhook secret: ${SECRET ? '***SET***' : 'NOT SET'}`);
    console.log(`📁 Repository path: ${REPO_PATH}`);
    console.log('🚀 Ready to receive deployment webhooks!');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('📴 Webhook deployment server shutting down...');
    process.exit(0);
});