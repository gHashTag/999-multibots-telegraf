# Deployment Guide

This directory contains all deployment-related configurations and scripts.

## Structure

```
deployment/
├── docker/              # Docker configurations
│   ├── Dockerfile      # Production container
│   ├── docker-compose.yml  # Development stack
│   └── docker-entrypoint.sh  # Container startup
├── ansible/            # Ansible automation
│   ├── ansible.cfg    # Ansible configuration
│   ├── inventory      # Server inventory
│   ├── playbook.yml   # Main deployment playbook
│   └── roles/         # Ansible roles
└── scripts/           # Deployment scripts
    ├── deploy.sh      # Main deployment script
    ├── start.sh       # Application startup
    └── update-docker.sh  # Docker update script
```

## Quick Start

### Local Development

```bash
# Start with Docker Compose
cd deployment/docker
docker-compose up -d

# Or run locally
npm run dev
```

### Production Deployment

```bash
# Deploy to production server
cd deployment
./scripts/deploy.sh production

# Or use Ansible
cd ansible  
ansible-playbook -i inventory playbook.yml
```

## Environment Setup

1. **Copy environment files**:
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

2. **Configure servers** in `ansible/inventory`
3. **Update deployment scripts** as needed

## Docker Deployment

The application is containerized for easy deployment:

```bash
# Build image
docker build -f deployment/docker/Dockerfile -t telegram-bot .

# Run container
docker run -d \
  --name telegram-bot \
  --env-file .env \
  -p 3000:3000 \
  telegram-bot
```

## Ansible Deployment

Automated deployment using Ansible:

```bash
cd deployment/ansible

# Test connection
ansible all -i inventory -m ping

# Deploy application
ansible-playbook -i inventory playbook.yml
```

## Configuration

### Environment Variables

Required environment variables:
- `BOT_TOKEN_*`: Telegram bot tokens
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_KEY`: Supabase service key
- `OPENAI_API_KEY`: OpenAI API key
- `NODE_ENV`: Environment (production/development)

### Nginx Configuration

Nginx configuration for reverse proxy:
- Static files serving
- SSL termination
- Load balancing
- Bot webhook endpoints

### PM2 Configuration

Process manager configuration:
- Auto-restart on crashes
- Log management
- Cluster mode
- Environment variables

## Monitoring

### Health Checks

- HTTP health endpoint: `/health`
- Database connectivity check
- External API status

### Logs

- Application logs: `logs/app-*.log`
- Error logs: `logs/error-*.log`
- Access logs: `/var/log/nginx/`

### Metrics

- CPU and memory usage
- Request rates
- Error rates  
- Response times

## Troubleshooting

### Common Issues

1. **Bot not responding**
   - Check bot token validity
   - Verify webhook configuration
   - Check network connectivity

2. **Database errors**
   - Verify Supabase credentials
   - Check connection pooling
   - Review database logs

3. **High memory usage**
   - Review log retention settings
   - Check for memory leaks
   - Monitor file uploads

### Debug Commands

```bash
# Check container logs
docker logs telegram-bot

# Check PM2 processes
pm2 list
pm2 logs telegram-bot

# Test database connection
npm run test:db

# Verify environment
npm run config:check
```