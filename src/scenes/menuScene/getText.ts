const texts = {
  ru: {
    digitalAvatar: `🚀 Чтобы начать создавать нейрофотографии, вам нужно обучить ИИ модель на ваших фотографиях. Для этого, пожалуйста, оформите подписку на бота, чтобы получить доступ к этой функции!\n\nПредставь, как твои фотографии превращаются в стильные и современные произведения искусства, подчеркивая твою индивидуальность и выделяя из толпы.\n\nЧтобы начать создавать нейрофотографии, Выберите команду 💫 Оформить подписку в главном меню`,
    neurophoto: `🚀 Чтобы начать создавать нейрофотографии, Выберите команду 📸 Нейрофото в главном меню`,
    avatarLevel: (newCount: number) =>
      `🆔 Уровень вашего аватара: ${newCount} \n\n🤖 Чтобы начать пользоваться ботом нажмите команду /menu\n\n🔓 Хотите разблокировать все функции?\n💫 Оформите подписку, чтобы получить полный доступ!`,
    mainMenu: '🏠 Главное меню\n\nВыберите нужный раздел 👇',
    inviteLink: 'Ссылка для приглашения друзей 👇🏻',
  },
  en: {
    digitalAvatar: `🚀 To start creating neurophotographs, you need to train the AI model on your photos. Please subscribe to the bot to access this feature!\n\nImagine your photos turning into stylish and modern art pieces, highlighting your individuality and standing out from the crowd.\n\nTo start creating neurophotographs, select the 💫 Subscribe command in the main menu`,
    neurophoto: `🚀 To start creating neurophotographs, Выберите команду 📸 Нейрофото в главном меню`,
    avatarLevel: (newCount: number) =>
      `🚀 To unlock the next level of the avatar and gain access to new features, invite friend! 🌟\n\n🆔 Level your avatar: ${newCount} invitations \n\n🤖 To start using the bot, click the /menu command\n\n🔓 Want to unlock all features?\n💫 Subscribe to get full access!`,
    mainMenu: '🏠 Main menu\n\nChoose the section 👇',
    inviteLink: 'Invite link for friends 👇🏻',
  },
}

export const getText = (isRu: boolean, key: string, ...args: any[]) => {
  const lang = isRu ? 'ru' : 'en'

  const text = texts[lang][key]
  if (!text) {
    console.error('❌ Текст не найден:', {
      description: 'Text not found',
      key,
      lang,
    })
    return ''
  }
  return typeof text === 'function' ? text(...args) : text
}
