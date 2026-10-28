import React from 'react'
import ReactDOM from 'react-dom/client'
import { enforceAccounts } from './account/scope'
import AccountGate from './account/AccountGate'
import './account/account.css'
import '@fontsource-variable/dm-sans'
import './styles/tokens.css'
import './index.css'
import './styles/pop.css'
import './styles/lifestyle.css'
import './styles/map-layout.css'
import './styles/costs.css'

enforceAccounts()
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AccountGate />
  </React.StrictMode>,
)
