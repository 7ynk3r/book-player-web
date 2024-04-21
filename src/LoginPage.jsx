import React, { useCallback, useState } from 'react';

import assert from './assert';

function LoginForm({ validateCredentials }) {
  assert(validateCredentials, 'validateCredentials should be defined')

  // Define state variables for email and password
  const [ready, setReady] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // Handle email input change
  const handleUserChange = useCallback((event) => {
    setEmail(event.target.value);
  }, [setEmail]);

  // Handle password input change
  const handlePasswordChange = useCallback((event) => {
    setPassword(event.target.value);
  }, [setPassword]);

  // Handle form submission
  const handleSubmit = useCallback(async (event) => {
    setReady(false)
    event.preventDefault();
    // Validate credentials
    let isValid = false;
    try { isValid = await validateCredentials({ email, password }); }
    catch { }
    setError(isValid ? '' : 'Invalid email or password');
    setReady(true)
  }, [email, password, setReady, validateCredentials]);

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label htmlFor="email">Email:</label>
        <input
          type="text"
          id="email"
          value={email}
          onChange={handleUserChange}
        />
      </div>
      <div>
        <label htmlFor="password">Password:</label>
        <input
          type="password"
          id="password"
          value={password}
          onChange={handlePasswordChange}
        />
      </div>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <button type="submit" disabled={!ready}>Login</button>
    </form>
  );
}

export default LoginForm;
