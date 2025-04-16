import { supabase } from '.'

export async function setMyWorkspace(telegram_id: string) {
  try {
    const { data: workspaceData, error: workspaceError } = await supabase
      .from('workspaces')
      .select('workspace_id')
      .eq('telegram_id', telegram_id)
      .single()

    if (workspaceError && workspaceError.code !== 'PGRST116') {
      throw new Error(`Error checking workspace: ${workspaceError.message}`)
    }

    if (workspaceData) {
      return workspaceData.workspace_id
    }

    const { data, error } = await supabase
      .from('workspaces')
      .insert([
        {
          title: 'Fire',
          telegram_id,
          enabled: true,
        },
      ])
      .select('workspace_id')
      .single()

    if (error) {
      console.log(error, 'setMyWorkspace error:::')
      throw new Error('Failed to create workspace')
    }

    return data.workspace_id
  } catch (error) {
    console.error('Error setting my workspace:', error)
    return null
  }
}
