# 🤖 Bot Financial Reports System

Comprehensive Excel generation system for analyzing bot financial performance and generating detailed reports.

## Features

### 📊 Multi-Sheet Excel Reports
- **Summary Overview**: Key financial metrics and statistics
- **Financial Details**: Monthly/payment method breakdown with ruble conversion
- **Service Analytics**: Revenue and profitability by service type
- **User Analytics**: Top users by spending with transaction patterns
- **Time Analytics**: Monthly and daily performance trends
- **Transaction Details**: Complete transaction history

### 💰 Financial Analysis
- **Income/Expense Tracking**: Real-time categorization of payments
- **Star to Ruble Conversion**: Automatic currency conversion (1⭐ = 1.8₽)
- **Service Profitability**: Cost analysis with margin calculations
- **User Segmentation**: Top 20 users analysis with spending patterns
- **Payment Method Analysis**: Robokassa vs Telegram Stars breakdown

### 🛠️ Service Integration
- **Unified Service Mapping**: Consistent service categorization
- **Real Cost Calculation**: Based on actual operational costs
- **Performance Metrics**: Transaction counts, average checks, revenue share

## Usage

### Basic Commands

```bash
# Generate report for specific bot
./scripts/generate-financial-reports.sh neuro_blogger_bot

# Generate reports for all bots
./scripts/generate-financial-reports.sh --all

# Generate report with upload (when implemented)
./scripts/generate-financial-reports.sh neuro_blogger_bot --upload

# Generate report for custom period (90 days)
./scripts/generate-financial-reports.sh neuro_blogger_bot --period=90
```

### Direct Node.js Usage

```bash
# Individual bot report
node scripts/bot-financial-report.js neuro_blogger_bot

# All bots processing
node scripts/bot-financial-report.js --all

# With upload and custom period
node scripts/bot-financial-report.js neuro_blogger_bot --upload --period=60
```

## File Structure

```
scripts/
├── bot-financial-report.js          # Main Excel generation script
├── generate-financial-reports.sh    # Wrapper shell script
└── README-financial-reports.md      # This documentation

reports/                              # Generated Excel files
├── bot_financial_report_neuro_blogger_bot_2025-09-20.xlsx
└── bot_financial_report_ai_heroes_bot_2025-09-20.xlsx
```

## Excel Report Structure

### 📊 Sheet 1: Сводка (Summary)
- Bot information and reporting period
- Key financial metrics (income, expenses, profit)
- Statistics (users, transactions, payment methods)
- Top 5 services by revenue

### 💰 Sheet 2: Финансы (Financial Details)
- Monthly financial breakdown
- Payment method analysis
- Currency conversion details
- Average transaction values

### 🛠️ Sheet 3: Сервисы (Services Analytics)
- Service-wise revenue and costs
- Profitability analysis per service
- Market share by service
- Operation counts and margins

### 👥 Sheet 4: Пользователи (Users Analytics)
- Top 20 users by spending
- Transaction patterns per user
- Average check calculations
- User contribution percentages

### 📅 Sheet 5: Динамика (Time Analytics)
- Monthly performance trends
- Daily statistics (last 30 days)
- Active user tracking
- Growth patterns

### 📋 Sheet 6: Транзакции (Transaction Details)
- Complete transaction history
- All payment details
- Service categorization
- Cost breakdowns

## Data Sources

### Primary Tables
- **payments_v2**: Main transaction data
- **users**: User information for analytics

### Key Fields Analyzed
- `bot_name`: Bot identification
- `type`: MONEY_INCOME vs MONEY_OUTCOME
- `category`: REAL, BONUS, ADMIN
- `service_type`: Service categorization
- `stars`, `amount`, `cost`: Financial values
- `payment_method`: Robokassa, Telegram, etc.
- `currency`: RUB, XTR, STARS

## Service Mapping

The system uses unified service mapping for consistent reporting:

```javascript
const SERVICE_MAPPING = {
  neuro_photo: { emoji: '🖼️', name: 'Нейрофото' },
  text_to_video: { emoji: '📹', name: 'Генерация видео' },
  image_to_video: { emoji: '🎬', name: 'Изображение в видео' },
  text_to_speech: { emoji: '🗣️', name: 'Озвучка текста' },
  // ... more services
};
```

## Currency Conversion

- **Current Rate**: 1 ⭐ = 1.8 ₽
- **Applied To**: All star-based transactions
- **Display**: Both stars and rubles in separate columns

## Cost Analysis

Based on real operational data from the `calculateServiceCost` system:

- **Neuro Photo**: 4⭐ per image
- **Video Services**: Variable costs (10-390⭐)
- **Audio Services**: 4-40⭐ range
- **Model Training**: 25-250⭐ range

## Error Handling

- **Missing Data**: Graceful handling with warnings
- **Database Errors**: Comprehensive error reporting
- **Large Datasets**: Pagination for memory efficiency
- **Invalid Bots**: Clear error messages

## Performance Features

- **Batch Processing**: Handles large datasets efficiently
- **Pagination**: 1000 records per batch
- **Memory Management**: Optimized for large reports
- **Progress Tracking**: Console logging for long operations

## Security

- **Environment Variables**: Secure credential handling
- **Data Validation**: Input sanitization
- **Error Sanitization**: No sensitive data in logs

## Future Enhancements

### Planned Features
- **Cloud Upload**: Automatic upload to accessible web location
- **Email Reports**: Automated report distribution
- **Scheduled Generation**: Cron job integration
- **Dashboard Integration**: Web interface for report generation

### Additional Analytics
- **Cohort Analysis**: User retention patterns
- **Seasonal Trends**: Holiday and seasonal impact
- **Predictive Analytics**: Revenue forecasting
- **Competitive Analysis**: Cross-bot comparisons

## Integration

### With Existing Systems
- **Supabase**: Direct database integration
- **Service Mapping**: Uses existing utilities
- **Cost Calculation**: Leverages current pricing logic
- **User Management**: Integrates with user system

### API Compatibility
- **Node.js Modules**: Exportable functions
- **CLI Interface**: Command-line ready
- **Programmatic Access**: Can be imported and used

## Troubleshooting

### Common Issues

```bash
# Missing dependencies
cd /root/999-agents-telegraf && npm install

# Permission issues
chmod +x scripts/generate-financial-reports.sh

# Database connection
# Check SUPABASE_URL and SUPABASE_SERVICE_KEY in .env

# Memory issues with large datasets
# Use --period=7 for smaller datasets
```

### Debug Mode

```bash
# Add debug logging
DEBUG=true node scripts/bot-financial-report.js neuro_blogger_bot
```

## Examples

### Real Bot Analysis

```bash
# Generate comprehensive report for main bot
./scripts/generate-financial-reports.sh neuro_blogger_bot --period=90

# Quick weekly analysis
./scripts/generate-financial-reports.sh neuro_blogger_bot --period=7

# All bots comparison
./scripts/generate-financial-reports.sh --all
```

### Report Outputs

Generated files follow the naming pattern:
`bot_financial_report_{BOT_NAME}_{DATE}.xlsx`

Example: `bot_financial_report_neuro_blogger_bot_2025-09-20.xlsx`

## Development

### Adding New Metrics

1. Extend the `processFinancialData` function
2. Update sheet creation functions
3. Add new columns to relevant sheets
4. Update documentation

### Custom Service Types

1. Update `SERVICE_MAPPING` constant
2. Add cost calculations in `calculateServiceCost`
3. Update service display logic

### New Export Formats

The system is designed to be extensible for additional formats:
- CSV export
- PDF reports
- JSON data dumps
- Database views

---

*Generated by the Excel Generation Coder in the hive mind collective*