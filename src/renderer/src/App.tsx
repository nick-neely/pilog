import { useEffect, useState } from 'react'
import { Inbox } from './features/inbox/Inbox'
import { Settings } from './features/settings/Settings'

type Route = 'inbox' | 'settings'

function App(): React.JSX.Element {
  const [route, setRoute] = useState<Route>('inbox')

  useEffect(() => {
    const unsubInbox = window.pilog.on('navigate:inbox', () => setRoute('inbox'))
    const unsubSettings = window.pilog.on('navigate:settings', () => setRoute('settings'))
    return () => {
      unsubInbox()
      unsubSettings()
    }
  }, [])

  if (route === 'settings') {
    return <Settings onBack={() => setRoute('inbox')} />
  }

  return <Inbox />
}

export default App
