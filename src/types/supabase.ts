import { Database } from './database'

export type Tables = Database['public']['Tables']
export type Enums = Database['public']['Enums']

// Users table types
export type Users = Tables['users']['Row']
export type InsertUser = Tables['users']['Insert']
export type UpdateUser = Tables['users']['Update']

// Payments table types
export type Payments = Tables['payments_v2']['Row']
export type InsertPayment = Tables['payments_v2']['Insert']
export type UpdatePayment = Tables['payments_v2']['Update']

// Assets table types
export type Assets = Tables['assets']['Row']
export type InsertAsset = Tables['assets']['Insert']
export type UpdateAsset = Tables['assets']['Update']

// Avatars table types
export type Avatars = Tables['avatars']['Row']
export type InsertAvatar = Tables['avatars']['Insert']
export type UpdateAvatar = Tables['avatars']['Update']
