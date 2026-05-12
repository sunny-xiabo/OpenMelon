import { TextField } from '@mui/material';

export default function JsonField({ label, value, onChange, minRows = 3, helper = '' }) {
  return (
    <TextField
      size="small"
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      multiline
      minRows={minRows}
      helperText={helper}
      sx={{ '& .MuiInputBase-input': { fontFamily: 'monospace', fontSize: 12 } }}
    />
  );
}
