# Execution Instructions - User Management for Telegram ID 5781166218

## Quick Start

Execute the comprehensive user management script:

```bash
cd /Users/playra/999-agents-telegraf
chmod +x scripts/run-user-management-production.sh
./scripts/run-user-management-production.sh
```

This will automatically:
1. ✅ Upload the management script to production server
2. ✅ Execute all 5 tasks on production server (212.86.115.30)
3. ✅ Display detailed results and verification
4. ✅ Generate comprehensive report

---

## What Will Happen

### Automatic Execution Flow

```
Local Machine (Mac)
    ↓
    [Upload Script via SCP]
    ↓
Production Server (212.86.115.30:/root/bot-farm)
    ↓
    [Execute Node.js Script]
    ↓
    [Connect to Supabase Database]
    ↓
    [Task 1] Check user in users table
    ↓
    [Task 2] Get balance via get_user_balance RPC
    ↓
    [Task 3] Check subscription status (NEUROTESTER/NEUROVIDEO/NEUROPHOTO)
    ↓
    [Task 4] Grant NEUROVIDEO if no active subscription
    ↓
    [Task 5] Verify user has NEUROVIDEO access
    ↓
    [Display Results]
    ↓
Local Machine
    ↓
    [Show Summary Report]
```

---

## Files Created

### 1. Production Script
**Path**: `/Users/playra/999-agents-telegraf/scripts/manage-user-5781166218-production.js`
- Standalone Node.js script
- Works with production environment
- Uses Supabase client from production codebase
- Includes all 5 tasks with detailed logging

### 2. Deployment Script
**Path**: `/Users/playra/999-agents-telegraf/scripts/run-user-management-production.sh`
- Bash script for automatic deployment
- Handles SSH connection and file transfer
- Executes script on production server
- Displays formatted results

### 3. Report Template
**Path**: `/Users/playra/999-agents-telegraf/scripts/user-5781166218-report.md`
- Comprehensive documentation
- Database query references
- Success criteria checklist
- Next steps guidance

---

## Detailed Task Breakdown

### Task 1: User Existence Check
**Query**: `users` table
**Fields**: id, telegram_id, username, first_name, last_name, bot_name, created_at, subscription

**Expected Output**:
```
✅ User FOUND:
   - ID: [database_id]
   - Telegram ID: 5781166218
   - Username: @[username]
   - Name: [first_name] [last_name]
   - Bot: [bot_name]
   - Created: [timestamp]
   - Subscription field: [value]
```

### Task 2: Balance Verification
**Method**: RPC function `get_user_balance('5781166218')`

**Expected Output**:
```
✅ Balance: [X,XXX.X] ⭐ stars

📊 Recent transactions:
   1. [date] | [type] | [stars]⭐ | [status]
   2. [date] | [type] | [stars]⭐ | [status]
   ...
```

### Task 3: Subscription Status
**Priority**: NEUROTESTER → NEUROVIDEO → NEUROPHOTO
**Duration**: 30 days (except NEUROTESTER = permanent)

**Expected Output** (if has subscription):
```
✅ ACTIVE SUBSCRIPTION FOUND
   - Subscription: NEUROVIDEO
   - Start Date: [timestamp]
   - Expiration: [timestamp + 30 days]
```

**Expected Output** (if no subscription):
```
❌ NO ACTIVE SUBSCRIPTION
```

### Task 4: Grant NEUROVIDEO
**Condition**: Only if no active subscription found

**Database Insert**:
```sql
INSERT INTO payments_v2 (...)
VALUES (
  telegram_id: '5781166218',
  subscription_type: 'NEUROVIDEO',
  status: 'COMPLETED',
  type: 'MONEY_INCOME',
  category: 'BONUS',
  is_system_payment: true,
  ...
)
```

**Expected Output**:
```
✅ NEUROVIDEO subscription granted successfully!
   - Record ID: [id]
   - Expires: [date + 30 days]
```

### Task 5: Access Verification
**Action**: Re-check subscription status

**Expected Output** (success):
```
✅ VERIFICATION SUCCESSFUL
   - Subscription: NEUROVIDEO
   - NEUROVIDEO access: GRANTED ✅
```

---

## Alternative Execution Methods

### Method 1: Direct SSH (Manual)

```bash
# Step 1: Upload script
scp -i ~/.ssh/zomro \
  /Users/playra/999-agents-telegraf/scripts/manage-user-5781166218-production.js \
  root@212.86.115.30:/root/bot-farm/scripts/

# Step 2: Execute on server
ssh -i ~/.ssh/zomro root@212.86.115.30 \
  'cd /root/bot-farm && node scripts/manage-user-5781166218-production.js'
```

### Method 2: Interactive SSH

```bash
# Connect to server
ssh -i ~/.ssh/zomro root@212.86.115.30

# Navigate to project
cd /root/bot-farm

# Upload script (from another terminal)
# Then execute:
node scripts/manage-user-5781166218-production.js
```

### Method 3: Using Original Script (Local)

```bash
# From local machine (requires dependencies)
cd /Users/playra/999-agents-telegraf
node scripts/manage-user-5781166218.js
```

---

## Expected Results Summary

### Success Case (User has no active subscription)
```
╔════════════════════════════════════════════════════════════════╗
║                        SUMMARY REPORT                          ║
╚════════════════════════════════════════════════════════════════╝

📊 User Status: ✅ Found
💰 Balance: [X,XXX] ⭐ stars
📋 Subscription: ✅ Active
🎯 NEUROVIDEO Access: ✅ GRANTED

✅ Script completed successfully!
```

### Success Case (User already has subscription)
```
╔════════════════════════════════════════════════════════════════╗
║                        SUMMARY REPORT                          ║
╚════════════════════════════════════════════════════════════════╝

📊 User Status: ✅ Found
💰 Balance: [X,XXX] ⭐ stars
📋 Subscription: ✅ Active (NEUROTESTER/NEUROVIDEO)
🎯 NEUROVIDEO Access: ✅ GRANTED

ℹ️  User already has active subscription - no action needed
```

---

## Troubleshooting

### Error: SSH Key Not Found
```bash
# Check SSH key exists
ls -la ~/.ssh/zomro

# If missing, contact server admin
```

### Error: Permission Denied
```bash
# Verify SSH key permissions
chmod 600 ~/.ssh/zomro

# Try connection
ssh -i ~/.ssh/zomro root@212.86.115.30
```

### Error: Script Upload Failed
```bash
# Check script exists
ls -la scripts/manage-user-5781166218-production.js

# Manual upload
scp -i ~/.ssh/zomro scripts/manage-user-5781166218-production.js \
  root@212.86.115.30:/root/bot-farm/scripts/
```

### Error: Node.js Not Found
```bash
# On server, check Node.js
ssh -i ~/.ssh/zomro root@212.86.115.30 'node --version'

# Should show: v18.x.x or v20.x.x
```

### Error: Supabase Connection Failed
```bash
# Check environment variables on server
ssh -i ~/.ssh/zomro root@212.86.115.30 \
  'cd /root/bot-farm && cat .env | grep SUPABASE'

# Verify URL and keys are present
```

---

## Verification Commands

After execution, you can verify the results:

### Check User Record
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 << 'EOF'
cd /root/bot-farm
node -e "
const { supabase } = require('./dist/core/supabase/index.js');
supabase.from('users').select('*').eq('telegram_id', '5781166218').single()
  .then(r => console.log(JSON.stringify(r.data, null, 2)));
"
EOF
```

### Check Subscription
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 << 'EOF'
cd /root/bot-farm
node -e "
const { supabase } = require('./dist/core/supabase/index.js');
supabase.from('payments_v2')
  .select('*')
  .eq('telegram_id', '5781166218')
  .eq('subscription_type', 'NEUROVIDEO')
  .order('payment_date', { ascending: false })
  .limit(1)
  .then(r => console.log(JSON.stringify(r.data, null, 2)));
"
EOF
```

### Check Balance
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 << 'EOF'
cd /root/bot-farm
node -e "
const { supabase } = require('./dist/core/supabase/index.js');
supabase.rpc('get_user_balance', { user_telegram_id: '5781166218' })
  .then(r => console.log('Balance:', r.data, '⭐ stars'));
"
EOF
```

---

## Post-Execution Actions

After successful script execution:

1. **✅ Verify in Bot Interface**
   - User should see NEUROVIDEO features enabled
   - Test video generation functionality
   - Check for any error messages

2. **✅ Monitor Logs**
   ```bash
   ssh -i ~/.ssh/zomro root@212.86.115.30 \
     'docker logs 999-multibots --tail 100 | grep 5781166218'
   ```

3. **✅ Set Reminder**
   - NEUROVIDEO subscription expires in 30 days
   - Set calendar reminder for renewal check
   - Monitor user activity during subscription period

4. **✅ Document Results**
   - Update user support ticket (if exists)
   - Note subscription grant in admin log
   - Archive execution output for records

---

## Security Notes

- ✅ Uses service_role_key for admin database access
- ✅ All grants marked with `is_system_payment: true`
- ✅ Category set to `BONUS` for manual admin grants
- ✅ Unique invoice ID generated with timestamp
- ✅ Full audit trail in `payments_v2` table
- ✅ SSH connection uses private key authentication

---

## Support Contact

If you encounter issues:

1. Check error messages in script output
2. Verify SSH connection to production server
3. Confirm database credentials in .env file
4. Review server logs: `docker logs 999-multibots`
5. Contact system administrator with error details

---

## Quick Reference

**User ID**: 5781166218
**Server**: 212.86.115.30
**Project**: /root/bot-farm
**Database**: Supabase (yuukfqcsdhkyxegfwlcb)
**Subscription**: NEUROVIDEO (30 days)
**Grant Type**: Manual admin grant (BONUS category)

---

**Ready to Execute?**

```bash
chmod +x scripts/run-user-management-production.sh
./scripts/run-user-management-production.sh
```

**Estimated Execution Time**: 10-30 seconds

Good luck! 🚀
