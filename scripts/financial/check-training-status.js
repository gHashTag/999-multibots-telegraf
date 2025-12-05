const Replicate = require('replicate');

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

async function checkStatus() {
  const trainingId = '72cfqpy61nrm80ctvz7ayx4cag';
  
  try {
    console.log(`🔍 Проверяю статус обучения: ${trainingId}`);
    
    const training = await replicate.trainings.get(trainingId);
    
    console.log('\n📊 Статус обучения:');
    console.log('ID:', training.id);
    console.log('Status:', training.status);
    console.log('Created:', training.created_at);
    console.log('Completed:', training.completed_at);
    console.log('Output:', training.output ? 'Есть результат' : 'Нет результата');
    
    if (training.output) {
      console.log('\n✅ ОБУЧЕНИЕ ЗАВЕРШЕНО!');
      console.log('Результат:', training.output);
    } else {
      console.log('\n⏳ Модель еще тренируется...');
      console.log('Ожидаемое время: 1-2 часа');
    }
    
    if (training.error) {
      console.log('\n❌ Ошибка обучения:', training.error);
    }
    
  } catch (error) {
    console.error('❌ Ошибка при проверке статуса:', error.message);
  }
}

checkStatus();
