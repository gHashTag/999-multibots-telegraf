# Deploy to Test Server 45.66.11.152

## Steps to Deploy

### 1. Connect to Server

```bash
ssh -i ~/.ssh/zomro root@45.66.11.152
```

Or if password is needed:
```bash
ssh root@45.66.11.152
```

### 2. Navigate to Repository

```bash
cd /root/999-multibots
```

### 3. Pull Latest Changes

```bash
git fetch origin
git checkout main
git pull origin main
```

### 4. Stop Current Container

```bash
docker-compose down
```

### 5. Rebuild Docker Image

```bash
docker-compose build --no-cache
```

This will:
- Install `inngest` in production dependencies
- Add `id` field to Inngest client
- Update `serve()` to v3 syntax
- Register 7 Inngest functions

### 6. Start Container

```bash
docker-compose up -d
```

### 7. Check Logs

```bash
docker-compose logs -f --tail 100
```

Look for:
- ✅ `[API] Server started on port 3000`
- ✅ `🚀 [INNGEST] Registering functions {"count":7,...}`
- ✅ `✅ Все боты успешно запущены`

### 8. Verify Inngest Endpoint

Check that endpoint is accessible:
```bash
curl http://localhost:3000/api/inngest
```

Should return Inngest metadata (not 404).

### 9. Connect to Inngest Cloud

Follow `INNGEST_SETUP.md` to:
1. Get public URL of your server
2. Register endpoint in Inngest Dashboard
3. Update `.env` with new keys:
   ```env
   BOT_INNGEST_EVENT_KEY=your_new_key
   BOT_INNGEST_SIGNING_KEY=your_new_signing_key
   BOT_INNGEST_BASE_URL=https://YOUR_DOMAIN/api/inngest
   ```
4. Restart container: `docker-compose restart`

## Troubleshooting

### Docker build fails
```bash
docker system prune -a
docker-compose build --no-cache
```

### Container crashes
```bash
docker-compose logs
# Look for errors in Inngest initialization
```

### Port conflicts
```bash
docker ps -a
docker stop $(docker ps -aq)
docker-compose up -d
```

## After Deployment

1. Check Inngest Dashboard - 7 functions should appear
2. Test AI Reels generation
3. Monitor logs for errors
4. If stable → Deploy to production (212.86.115.30)
