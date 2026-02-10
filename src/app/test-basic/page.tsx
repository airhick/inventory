'use client';

export default function TestBasic() {
  return (
    <div style={{ 
      margin: 0, 
      padding: '50px', 
      fontFamily: 'Arial',
      fontSize: '32px', 
      color: 'green', 
      backgroundColor: '#f0f0f0', 
      minHeight: '100vh'
    }}>
      <h1>✅ Test Basic - Next.js fonctionne !</h1>
      <p>Si vous voyez ce message, Next.js fonctionne correctement.</p>
      <p style={{ color: 'blue' }}>URL: /test-basic</p>
      <p style={{ color: 'red', fontSize: '16px' }}>Timestamp: {new Date().toISOString()}</p>
    </div>
  );
}
