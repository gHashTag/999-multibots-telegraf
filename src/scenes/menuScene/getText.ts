const texts = {
  ru: {
    neurophoto: `🚀 Чтобы начать создавать нейрофотографии, Выберите команду 📸 Нейрофото в главном меню`,
    avatarLevel: (newCount: number) =>
      `🆔 Уровень вашего аватара: ${newCount} \n\n🤖 Чтобы начать пользоваться ботом нажмите команду /menu\n\n🔓 Хотите разблокировать все функции?\n💳 Оформите подписку, чтобы получить полный доступ!`,
    mainMenu: '🏠 Главное меню\nВыберите нужный раздел 👇',
    inviteLink: 'Ссылка для приглашения друзей 👇🏻',
  },
  en: {
    neurophoto: `🚀 To start creating neurophotographs, Выберите команду 📸 Нейрофото в главном меню`,
    avatarLevel: (newCount: number) =>
      `🚀 To unlock the next level of the avatar and gain access to new features, invite friend! 🌟\n\n🆔 Level your avatar: ${newCount} invitations \n\n🤖 To start using the bot, click the /menu command\n\n🔓 Want to unlock all features?\n💳 Subscribe to get full access!`,
    mainMenu: '🏠 Main menu\nChoose the section 👇',
    inviteLink: 'Invite link for friends 👇🏻',
  },
}

export const getText = (isRu: boolean, key: string, ...args: any[]) => {
  const lang = isRu ? 'ru' : 'en'
  const text = texts[lang][key]
  return typeof text === 'function' ? text(...args) : text
}
