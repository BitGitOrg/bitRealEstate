import { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem("crr_token"));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const t = localStorage.getItem("crr_token");
      if (!t) { setLoading(false); return; }
      try {
        const { data } = await axios.get(`${API}/auth/me`, { headers: { Authorization: `Bearer ${t}` } });
        setUser(data);
        setToken(t);
      } catch (_) {
        localStorage.removeItem("crr_token");
      }
      setLoading(false);
    };
    init();
  }, []);

  const login = async (email, password) => {
    const { data } = await axios.post(`${API}/auth/login`, { email, password });
    localStorage.setItem("crr_token", data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem("crr_token");
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

export const apiClient = () => {
  const t = localStorage.getItem("crr_token");
  return axios.create({
    baseURL: API,
    headers: t ? { Authorization: `Bearer ${t}` } : {},
  });
};
