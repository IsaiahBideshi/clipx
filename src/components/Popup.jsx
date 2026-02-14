import "./popup.css";
import CircularProgress from '@mui/material/CircularProgress';
import Button from "@mui/material/Button";
export default function Popup({title, message, loading=false, onClose, buttonText}) {

    return (
        <div className={"popup-container"}>
          <div className={"popup-content"}>
            <h1>{title}</h1>
            <p>{message}</p>
            {loading && <CircularProgress/>}
            {!loading && <Button variant={"contained"} onClick={onClose}>{buttonText}</Button>}
          </div>
        </div>
    );
}
