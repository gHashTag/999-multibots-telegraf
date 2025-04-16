import {
  checkUsernameCodesByUserId,
  createUser,
  getSelectIzbushkaId,
  setMyWorkspace,
  setPassport,
  updateUser,
} from '@/core/supabase'
import { createOrFetchRoom } from './roomService'
import { v4 as uuidv4 } from 'uuid'
export type CreateUserT = {
  id: number
  username: string
  first_name: string
  last_name: string
  is_bot: boolean
  language_code: string
  chat_id: number
  inviter: string
  select_izbushka: string
  telegram_id: number
  photo_url: string
  bot_name: string
}

export const createUserService = async (userData: CreateUserT) => {
  const {
    id,
    inviter,
    username,
    first_name,
    last_name,
    is_bot,
    language_code,
    select_izbushka,
    telegram_id,
    photo_url,
    bot_name,
  } = userData
  console.log(userData, 'userData')

  const { isInviterExist, invitation_codes, inviter_user_id } =
    await checkUsernameCodesByUserId(inviter)

  if (!isInviterExist) {
    throw new Error('User not found')
  }

  const newUser = {
    username,
    first_name,
    last_name: last_name || '',
    is_bot,
    language_code,
    inviter: inviter_user_id,
    invitation_codes,
    telegram_id: id,
    select_izbushka,
    email: '',
    photo_url: photo_url || '',
  }

  const { user_id, isUserExist } = await createUser(newUser)

  if (!user_id) {
    throw new Error('Workspace not created')
  }

  if (isUserExist) {
    // Обновляем данные пользователя, если они изменились
    await updateUser({
      user_id,
      username,
      first_name,
      last_name: last_name || '',
      is_bot,
      language_code,
      photo_url,
    })
    return {
      user_id,
      message: 'User updated successfully',
    }
  }

  const workspace_id = await setMyWorkspace(user_id)

  console.log('workspace_id', workspace_id)

  const rooms = await createOrFetchRoom({
    name: `${username}:${uuidv4()}:${language_code}`,
    type: 'video-space',
    telegram_id: telegram_id.toString(),
    token: bot_name,
    chat_id: telegram_id.toString(),
  })

  console.log('rooms', rooms)

  if (!rooms) {
    throw new Error('Room not created')
  }

  const passport = {
    user_id,
    workspace_id,
    room_id: rooms.room_id,
    username,
    first_name,
    last_name: last_name || '',
    chat_id: id,
    type: 'room',
    is_owner: true,
  }

  const passport_id_owner = await setPassport(passport)

  const { izbushka } = await getSelectIzbushkaId(select_izbushka)

  if (
    !izbushka ||
    !izbushka.workspace_id ||
    !izbushka.room_id ||
    !izbushka.chat_id
  ) {
    throw new Error('Izbushka not found')
  }

  const passport_user = {
    user_id,
    workspace_id: izbushka.workspace_id,
    room_id: izbushka.room_id,
    username,
    first_name,
    last_name: last_name || '',
    chat_id: izbushka.chat_id,
    type: 'room',
    is_owner: false,
  }

  const passport_id_user = await setPassport(passport_user)
  console.log('passport_id_user', passport_id_user)

  return {
    user_id,
    passport_id_owner,
    passport_id_user,
    workspace_id,
    rooms_id: rooms.room_id,
    message: 'User created successfully',
  }
}
