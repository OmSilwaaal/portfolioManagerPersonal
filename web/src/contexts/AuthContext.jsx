import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../utils/supabase/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // undefined = still loading, null = no session, object = authenticated user
  const [user, setUser] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading: user === undefined }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
