import 'error.css';

export default function Error({ message }) {
  return (
    <div className="error-container">
      <h2 className="error-title">Error</h2>
      <p className="error-message">{message}</p>
    </div>
  );
}
