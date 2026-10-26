import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// findBy や waitFor が待つ上限(既定は 1 秒)。複数のテストを同時に走らせて CPU が詰まっても、描画が間に合うようにする
configure({ asyncUtilTimeout: 3000 })

afterEach(() => {
  cleanup()
})
