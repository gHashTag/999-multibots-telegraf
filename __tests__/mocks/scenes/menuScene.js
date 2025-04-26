// Mock for menuScene
module.exports = {
  menuScene: {
    enter: jest.fn(),
    leave: jest.fn(),
    use: jest.fn(),
    action: jest.fn(),
    command: jest.fn(),
    hears: jest.fn(),
    id: 'menuScene'
  }
}; 