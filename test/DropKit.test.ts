import DropKit from '../src/index'

test('contructor', () => {
  expect(() => new DropKit()).toThrow('No API key')
})
