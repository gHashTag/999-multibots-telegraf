#!/bin/bash

# This script adds FaceSwap integration to the Telegram bot
# It updates the necessary files to register the new scene

cd /Users/playra/999-agents-telegraf

echo "Step 1: Adding FaceSwap to PaidServiceEnum..."
# Add FaceSwap enum value
sed -i.bak "/ImageUpscaler = 'image_upscaler'/a\\
  FaceSwap = 'face_swap', // Замена лица на изображении
" src/interfaces/paidServices.ts

# Add FaceSwap config
sed -i.bak2 "/\\[PaidServiceEnum\\.ImageUpscaler\\]:/,/},/a\\
    [PaidServiceEnum.FaceSwap]: {\\
      name: 'Замена лица',\\
      pricingType: PricingType.SIMPLE,\\
      baseCostUSD: 0.01, // Себестоимость Replicate face-swap модели\\
      description: 'Замена лица на изображении с помощью ИИ',\\
      category: 'image',\\
    },
" src/interfaces/paidServices.ts

echo "Step 2: Adding FaceSwap to ModeEnum..."
sed -i.bak "/ImageUpscaler = PaidServiceEnum\\.ImageUpscaler/a\\
  FaceSwap = PaidServiceEnum.FaceSwap,
" src/interfaces/modes.ts

echo "Step 3: Exporting faceSwapWizard from scenes/index.ts..."
sed -i.bak "/export \\* from '.\/imageUpscalerWizard'/a\\
export * from './faceSwapWizard'
" src/scenes/index.ts

echo "Step 4: Adding faceSwapWizard import to registerCommands.ts..."
# This step would require manual editing as the import list is complex

echo ""
echo "✅ FaceSwap integration files updated!"
echo ""
echo "⚠️  MANUAL STEPS REQUIRED:"
echo "1. Add 'faceSwapWizard' to the import list in src/registerCommands.ts (line ~50)"
echo "2. Add 'faceSwapWizard,' to the stage array in src/registerCommands.ts (after imageUpscalerWizard)"
echo ""
echo "Files modified:"
echo "  - src/interfaces/paidServices.ts"
echo "  - src/interfaces/modes.ts"
echo "  - src/scenes/index.ts"
echo "  - src/scenes/faceSwapWizard/index.ts (created)"
echo ""
