import React from 'react';
import {
  Box,
  Container,
  Typography,
  Grid
} from '@mui/material';

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <Box
      component="footer"
      sx={{
        bgcolor: '#1a1a1a',
        color: 'white',
        py: 6,
        mt: 8
      }}
    >
      <Container maxWidth="lg">

        {/* 底部信息 */}
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={6}>
            <Typography variant="body2" sx={{ opacity: 0.6 }}>
              © {currentYear} AI测试用例生成平台. 保留所有权利.
            </Typography>
          </Grid>
        </Grid>

      </Container>
    </Box>
  );
};

export default Footer;
