import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import AppRoutes from './routes/AppRoutes';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ChatProvider } from './context/ChatContext';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <ChatProvider>
            <AppRoutes />
          </ChatProvider>
        </SocketProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#020617',
              color: '#e2e8f0',
              border: '1px solid rgba(255,255,255,0.08)',
            },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
