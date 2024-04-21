import React, { useCallback, useState } from 'react';
import { Typography, TextField, Button, Box } from '@mui/material';

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
      <div style={{ marginBottom: '16px' }}>
        <Typography htmlFor="email" variant="body1">Email:</Typography>
        <TextField
          type="text"
          id="email"
          value={email}
          onChange={handleUserChange}
          variant="outlined"
          fullWidth
          size="small"
        />
      </div>
      <div style={{ marginBottom: '16px' }}>
        <Typography htmlFor="password" variant="body1">Password:</Typography>
        <TextField
          type="password"
          id="password"
          value={password}
          onChange={handlePasswordChange}
          variant="outlined"
          fullWidth
          size="small"
        />
      </div>
      {error && <Typography style={{ color: 'red', marginBottom: '16px' }} variant="body2">{error}</Typography>}
      <Box mt={2}>
        <Button type="submit" disabled={!ready} variant="contained" color="primary" fullWidth>Login</Button>
      </Box>
    </form>
  );
}

export default LoginForm;
