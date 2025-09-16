# 🤖 HAIM Group Staff Management Guide

## 📋 Overview

This document describes how to manage shared models for HAIM Group staff members. The system creates personal copies of shared models for each staff member, allowing them to see meaningful model names instead of dates.

## 🎯 Current Implementation

### Staff Members List
Current HAIM Group staff members with model access:

```javascript
const HAIM_STAFF_IDS = [
  "144022504",   // @neuro_coder - Главный админ
  "289259562",   // @Vyacheslav_Neklyudov - Админ
  "752224685",   // @voskresenskaya13 - Админ
  "7669741878",  // @Arhustel - Админ
  "164609458",   // @artemfisenko - Админ
  "1036512726"   // Новый сотрудник
];
```

### Shared Models Available
- **"Вячеслав"** - 2000 steps, replicate API
- **"CocoAge"** - 2000 steps, replicate API

Based on original model: `ed2c6365-e782-4816-a1ef-1e26b79f6da0`

## 🚀 Adding New Staff Members

### Step 1: Update Staff IDs List
Add the new Telegram ID to the array in `/src/menu/mainMenu.ts`:

```typescript
const HAIM_GROUP_STAFF_IDS = [
  '144022504',
  '289259562',
  '752224685',
  '7669741878',
  '164609458',
  '1036512726',
  '999999999'  // <- Add new staff member ID here
]
```

### Step 2: Create Model Copies
Run the automated script to create model copies for the new staff member:

```bash
# Method 1: For single user
ssh -i ~/.ssh/selectel root@185.161.67.53 'cd /root/999-agents-telegraf && docker exec 999-multibots node -e "
const { createModelCopiesForHaimStaff } = require(\"/app/scripts/create-haim-models.js\");
const SINGLE_USER = [\"999999999\"]; // Replace with actual Telegram ID

async function addSingleUser() {
  // Copy the script logic but with SINGLE_USER instead of HAIM_STAFF_IDS
}
addSingleUser().then(() => process.exit(0));
"'

# Method 2: Re-run full script (will skip existing users)
ssh -i ~/.ssh/selectel root@185.161.67.53 'cd /root/999-agents-telegraf && docker exec 999-multibots node scripts/create-haim-models.js'
```

### Step 3: Verify Models Created
Check that the models were created successfully:

```bash
ssh -i ~/.ssh/selectel root@185.161.67.53 'cd /root/999-agents-telegraf && docker exec 999-multibots node -e "
const { supabase } = require(\"/app/dist/core/supabase/index.js\");

async function verifyNewUser() {
  const { data, error } = await supabase
    .from(\"model_trainings\")
    .select(\"id, model_name, status\")
    .eq(\"telegram_id\", \"999999999\") // Replace with actual ID
    .in(\"model_name\", [\"Вячеслав\", \"CocoAge\"]);

  console.log(\"Models for new user:\", data);
}
verifyNewUser().then(() => process.exit(0));
"'
```

### Step 4: Test User Experience
Test that the new user sees the models correctly:

```bash
ssh -i ~/.ssh/selectel root@185.161.67.53 'cd /root/999-agents-telegraf && docker exec 999-multibots node -e "
const { getActiveUserModelsByTypeForHaim } = require(\"/app/dist/core/supabase/getActiveUserModelsByTypeForHaim.js\");

async function testNewUser() {
  const models = await getActiveUserModelsByTypeForHaim(999999999, \"replicate\", \"HaimGroupMedia_bot\");
  console.log(\"User sees\", models ? models.length : 0, \"models\");

  if (models) {
    models.slice(0, 3).forEach((model, i) => {
      console.log(\`\${i+1}. \${model.model_name} (\${model.steps} шагов)\`);
    });
  }
}
testNewUser().then(() => process.exit(0));
"'
```

## 🔧 Removing Staff Members

### Step 1: Remove from Staff List
Remove the Telegram ID from `HAIM_GROUP_STAFF_IDS` array in `/src/menu/mainMenu.ts`

### Step 2: Delete Model Copies (Optional)
If you want to remove their model copies:

```bash
ssh -i ~/.ssh/selectel root@185.161.67.53 'cd /root/999-agents-telegraf && docker exec 999-multibots node -e "
const { supabase } = require(\"/app/dist/core/supabase/index.js\");

async function removeUserModels() {
  const result = await supabase
    .from(\"model_trainings\")
    .delete()
    .eq(\"telegram_id\", \"999999999\") // Replace with actual ID
    .in(\"model_name\", [\"Вячеслав\", \"CocoAge\"]);

  console.log(\"Deleted models:\", result);
}
removeUserModels().then(() => process.exit(0));
"'
```

## 📊 System Architecture

### Model Storage
- **Location**: `model_trainings` table in Supabase
- **Structure**: Each staff member gets individual model records
- **Ownership**: Models are owned by individual telegram_id
- **Type**: All models use `api: "replicate"` and `status: "SUCCESS"`

### Display Logic
1. **Model Selection**: Uses `getActiveUserModelsByTypeForHaim()` for HaimGroupMedia_bot
2. **Name Priority**: Shows `model_name` if available, otherwise shows date
3. **Button Text**: Format: `"ModelName (Steps шагов)"`
4. **Callback Data**: Shortened IDs to avoid 64-byte Telegram limit

### Code Locations
- **Staff IDs**: `/src/menu/mainMenu.ts` - `HAIM_GROUP_STAFF_IDS`
- **Model Function**: `/src/core/supabase/getActiveUserModelsByTypeForHaim.ts`
- **UI Logic**: `/src/scenes/neuroPhotoWizard/index.ts`
- **Creation Script**: `/scripts/create-haim-models.js`

## 🧪 Testing Checklist

When adding new staff members, verify:

- [ ] User ID added to `HAIM_GROUP_STAFF_IDS` array
- [ ] Model copies created in database (2 models per user)
- [ ] Models have correct names: "Вячеслав" and "CocoAge"
- [ ] Models show in neuroPhoto wizard with names, not dates
- [ ] Callback data works (no BUTTON_DATA_INVALID errors)
- [ ] Both shared and personal models display correctly
- [ ] User can select and use both model types

## 🚨 Troubleshooting

### Common Issues

**Issue**: New user doesn't see shared models
- **Check**: Verify user ID is in `HAIM_GROUP_STAFF_IDS` array
- **Check**: Verify bot_name is `'HaimGroupMedia_bot'`
- **Check**: Verify models exist in database for this telegram_id

**Issue**: Models show dates instead of names
- **Check**: Verify `model_name` field is not empty in database
- **Check**: Verify display logic in neuroPhotoWizard

**Issue**: BUTTON_DATA_INVALID error
- **Check**: Verify callback_data length < 64 bytes
- **Check**: Verify callback handler supports shortened IDs

### Debug Commands

Check user models:
```bash
# Check what models user has
docker exec 999-multibots node -e "
const { supabase } = require('./dist/core/supabase/index.js');
supabase.from('model_trainings').select('*').eq('telegram_id', 'USER_ID').then(r => console.log(r.data));
"
```

Test model display:
```bash
# Test how models appear in UI
docker exec 999-multibots node -e "
const { getActiveUserModelsByTypeForHaim } = require('./dist/core/supabase/getActiveUserModelsByTypeForHaim.js');
getActiveUserModelsByTypeForHaim(USER_ID, 'replicate', 'HaimGroupMedia_bot').then(r => console.log(r));
"
```

## 📈 Future Improvements

### Automated Staff Management
Consider creating a CLI tool for easier staff management:
```bash
npm run haim:add-staff <telegram_id> <username>
npm run haim:remove-staff <telegram_id>
npm run haim:list-staff
npm run haim:verify-models
```

### Additional Model Types
To add new shared models:
1. Update `ORIGINAL_MODEL_ID` in creation script
2. Add new model names to the creation logic
3. Update verification scripts to check new models
4. Test with existing staff members

## 📝 Change Log

- **2025-09-16**: Initial implementation with 6 staff members
- **2025-09-16**: Added automated model copying script
- **2025-09-16**: Implemented unified display logic
- **2025-09-16**: Fixed BUTTON_DATA_INVALID error

---

**Last Updated**: September 16, 2025
**Maintained By**: HAIM Group Development Team