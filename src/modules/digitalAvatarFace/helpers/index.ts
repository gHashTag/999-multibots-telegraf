export const formatInputForAvatarFace = (input: any): any => {
  return {
    features: input.features || {},
    style: input.style || 'default',
  }
}
