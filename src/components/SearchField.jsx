import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';

export default function SearchField({ loading, InputProps, ...props }) {
  return (
    <TextField
      {...props}
      InputProps={{
        ...InputProps,
        endAdornment: (
          <>
            {loading && <CircularProgress color="inherit" size={18} />}
            {InputProps?.endAdornment}
          </>
        ),
      }}
    />
  );
}
