---
description: Подключение к базе данных. 
globs: 
alwaysApply: false
---
# 🗄️ Database Scripts Guide

## Translation Management Scripts
- [add_translations.sql](mdc:scripts/add_translations.sql) - Add new translations
- [check_translations.sql](mdc:scripts/check_translations.sql) - Check translation status
- [check_and_fix_translations.sql](mdc:scripts/check_and_fix_translations.sql) - Automated translation fixes

## Usage with Supabase

### Check Translations
```bash
psql -h db.yuukfqcsdhkyxegfwlcb.supabase.co -U postgres -f scripts/check_translations.sql
```

### Add New Translations
```bash
psql -h db.yuukfqcsdhkyxegfwlcb.supabase.co -U postgres -f scripts/add_translations.sql
```

### Fix Translation Issues
```bash
psql -h db.yuukfqcsdhkyxegfwlcb.supabase.co -U postgres -f scripts/check_and_fix_translations.sql
```

## Important Notes
- Always backup database before running fix scripts
- Check translation status before adding new ones
- Use transaction blocks for safety
- Monitor query execution time
