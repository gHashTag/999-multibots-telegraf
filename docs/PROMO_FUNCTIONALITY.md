# Promo Link Functionality

## Overview

The promo link functionality allows users to receive free stars (bonus currency) when they access the bot through special promotional links. These bonus stars are equivalent to subscription tier amounts but are marked as promotional/bonus stars to distinguish them from real money transactions.

## How It Works

### URL Structure
- **Promo URL**: `https://t.me/MetaMuse_Manifest_bot/promo`
- **With Parameter**: `https://t.me/MetaMuse_Manifest_bot/promo?start=video`
- **Command Format**: `/start promo` or `/start promo video`

### Supported Promo Types

1. **Default Promo** (`/start promo`)
   - Grants NEUROPHOTO tier equivalent stars (476 stars)
   - Promo type: `welcome_bonus`

2. **Video Promo** (`/start promo video`)
   - Grants NEUROVIDEO tier equivalent stars (1303 stars)
   - Promo type: `video_promo`

3. **Photo Promo** (`/start promo photo`)
   - Grants NEUROPHOTO tier equivalent stars (476 stars)
   - Promo type: `photo_promo`

4. **Custom Promo** (`/start promo <custom_parameter>`)
   - Grants default tier stars with custom promo type
   - Promo type: `custom_<parameter>`

## Integration with Existing System

### Database Schema Compatibility

The promo functionality integrates seamlessly with the existing `payments_v2` table structure:

```sql
create table public.payments_v2 (
  id serial not null,
  telegram_id bigint not null,
  payment_date timestamp with time zone not null default now(),
  amount numeric not null default 0,
  description text null,
  metadata jsonb null default '{}'::jsonb,
  stars numeric(10, 2) not null default 0,
  currency character varying(10) not null default 'STARS'::character varying,
  inv_id character varying(100) null,
  invoice_url text null,
  status public.payment_status not null,
  type public.operation_type not null,
  service_type text null,
  operation_id text null,
  bot_name character varying(255) not null,
  language character varying(2) null default 'ru'::character varying,
  payment_method text null,
  subscription_type text null,
  is_system_payment boolean null default false,
  created_at timestamp with time zone not null default now(),
  cost numeric null,
  category public.simple_transaction_category not null default 'REAL'::simple_transaction_category,
  model_name text null
);
```

### Key Integration Points

1. **Uses Existing Category Field**: 
   - `category = 'REAL'` for real money transactions
   - `category = 'BONUS'` for promotional bonuses

2. **Compatible with Balance Calculations**:
   - Existing balance logic in `src/scenes/balanceScene/index.ts` already separates real and bonus payments
   - No changes needed to balance display functionality

3. **Works with Statistics**:
   - Existing stats commands already handle BONUS category payments
   - Promo bonuses appear correctly in financial breakdowns

4. **User Creation Flow**:
   - Integrated into `src/scenes/createUserScene.ts`
   - Works for both new and existing users
   - Maintains compatibility with referral system

### No Breaking Changes

- ✅ Existing payment processing unchanged
- ✅ Balance calculations work correctly  
- ✅ Statistics and reporting maintain accuracy
- ✅ User creation flow enhanced, not replaced
- ✅ All existing functionality preserved

## Implementation Details

### Database Storage

Promo bonuses are stored in the `payments_v2` table with the following characteristics:

- **Type**: `MONEY_INCOME` (not a separate bonus type)
- **Category**: `'BONUS'` (uses existing category field)
- **Metadata**:
  ```json
  {
    "is_promo": true,
    "promo_type": "welcome_bonus",
    "subscription_tier_equivalent": "NEUROPHOTO",
    "stars_granted": 476,
    "allocation_timestamp": "2024-01-01T00:00:00.000Z",
    "category": "BONUS"
  }
  ```

### Key Features

1. **Duplicate Prevention**: Users can only receive each promo type once
2. **New and Existing Users**: Works for both new registrations and existing users
3. **Proper Tracking**: All promo allocations are logged and tracked
4. **Admin Notifications**: Admin channel receives notifications about promo usage
5. **Multilingual Support**: Messages in Russian and English

### Code Structure

#### Core Files

1. **`src/helpers/contextUtils.ts`**
   - `extractPromoFromContext()`: Detects promo commands from user messages

2. **`src/helpers/promoHelper.ts`**
   - `allocatePromoStars()`: Allocates stars to users
   - `hasReceivedPromo()`: Checks if user already received specific promo
   - `processPromoLink()`: Main processing function

3. **`src/scenes/createUserScene.ts`**
   - Integrated promo detection and processing for user registration

#### Configuration

```typescript
export const DEFAULT_PROMO_CONFIG: PromoConfig = {
  defaultTier: SubscriptionType.NEUROPHOTO,
  promoType: 'welcome_bonus',
}
```

### Usage Examples

#### For New Users
1. User clicks `https://t.me/MetaMuse_Manifest_bot/promo`
2. Bot detects `/start promo` command
3. User account is created
4. 476 bonus stars are allocated
5. User receives welcome message + bonus notification

#### For Existing Users
1. Existing user clicks promo link
2. Bot checks if user already received this promo type
3. If not received: allocates stars and notifies user
4. If already received: shows "already received" message

### Error Handling

- **Database Errors**: Gracefully handled with user-friendly messages
- **Duplicate Promos**: Prevented with proper checking
- **Invalid Parameters**: Default configuration used as fallback
- **Network Issues**: Retry logic and error logging

### Testing

Run tests with:
```bash
npm test src/__tests__/promoHelper.test.ts
```

Tests cover:
- Promo command detection
- Configuration validation
- Payment type logic
- URL format handling

### Monitoring

- All promo activities are logged with detailed metadata
- Admin channel notifications for tracking usage
- Database queries for analytics and reporting

## Security Considerations

1. **One-time Use**: Each promo type can only be claimed once per user
2. **Metadata Validation**: Proper validation of promo parameters
3. **Database Integrity**: Proper transaction handling
4. **Logging**: Comprehensive logging for audit trails

## Future Enhancements

1. **Expiration Dates**: Add time-limited promos
2. **Usage Limits**: Global limits on promo usage
3. **Custom Star Amounts**: Admin-configurable star amounts
4. **Referral Integration**: Combine with referral system
5. **Analytics Dashboard**: Detailed promo usage analytics 