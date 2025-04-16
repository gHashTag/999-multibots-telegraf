import { setMyWorkspace, supabase } from '@/core/supabase'

import { transliterate } from '@/helpers'

type CreateOrFetchRoomProps = {
  name: string
  type: string
  telegram_id: string
  token: string
  chat_id: string
}

export const createOrFetchRoom = async ({
  name,
  type,
  telegram_id,
  token,
  chat_id,
}: CreateOrFetchRoomProps) => {
  const { data: userData } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegram_id.toString())
    .single()

  if (!userData) {
    throw new Error(`User not found: ${telegram_id}`)
  }

  const workspace_id = await setMyWorkspace(telegram_id)
  if (!workspace_id) {
    throw new Error('Failed to create or fetch workspace')
  }

  // Проверяем, существует ли уже комната с таким именем
  const { data: existingRoom } = await supabase
    .from('rooms')
    .select('room_id')
    .eq('name', name)
    .single()

  if (existingRoom) {
    console.log(
      `Room with name "${name}" already exists. Returning existing room_id.`
    )
    return existingRoom
  }
  const transliterateName = transliterate(name)
  console.log('transliterateName:', transliterateName)
  try {
    const response = await fetch(
      'https://api.huddle01.com/api/v2/sdk/rooms/create-room',
      {
        method: 'POST',
        body: JSON.stringify({
          title: transliterateName,
        }),
        headers: {
          'Content-type': 'application/json',
          'x-api-key': process.env.NEXT_PUBLIC_API_KEY as string,
        },
      }
    )
    console.log('response:', response)
    const roomData = await response.json()
    console.log('roomData:', roomData)

    const rooms = {
      workspace_id,
      type,
      name: transliterateName,
      enabled: true,
      chat_id,
      username: userData.username,
      public: false,
      created_at: new Date(),
      updated_at: new Date(),
      room_id: transliterateName,
      telegram_id,
      token,
      room_code: roomData.data.roomId,
    }

    console.log('Inserting room:', rooms)

    const { error } = await supabase.from('rooms').insert({
      ...rooms,
      id: undefined,
    })

    if (error) {
      console.error('Error saving to Supabase:', error)
      throw new Error(`Error saving to Supabase: ${error.message}`)
    }

    return rooms
  } catch (error) {
    console.error('Error creating room:', error)
    throw new Error(`Error creating room: ${error}`)
  }
}
