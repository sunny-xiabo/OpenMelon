import { Box, Button, Chip, Typography } from '@mui/material';
import { Delete as DeleteIcon } from '@mui/icons-material';
import { PAGE_SIZE } from '../constants';

export default function IndexPagination({
  doBatchDelete,
  files,
  goToPage,
  page,
  selected,
  totalPages,
}) {
  return (
    <Box sx={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 1,
      px: 2,
      py: 1,
      bgcolor: 'rgba(248,250,252,0.95)',
      borderTop: '1px solid',
      borderColor: 'rgba(226,232,240,0.6)',
      backdropFilter: 'blur(6px)',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 12 }}>
          共 <b>{files.length}</b> 条
          {files.length > 0 && (<>
            ，第 {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, files.length)} 条
          </>)}
        </Typography>
        {selected.size > 0 && (
          <Chip
            label={`已选 ${selected.size} 项`}
            size="small"
            color="primary"
            variant="outlined"
            sx={{ height: 22, fontSize: 11, borderRadius: 1.5 }}
          />
        )}
      </Box>

      {totalPages > 1 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Button
            size="small"
            disabled={page === 1}
            onClick={() => goToPage(page - 1)}
            sx={{ minWidth: 32, px: 0.5, fontSize: 12, color: 'text.secondary' }}
          >
            ‹
          </Button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, index) => {
            let nextPage;
            if (totalPages <= 5) nextPage = index + 1;
            else if (page <= 3) nextPage = index + 1;
            else if (page >= totalPages - 2) nextPage = totalPages - 4 + index;
            else nextPage = page - 2 + index;
            return (
              <Button
                key={nextPage}
                size="small"
                onClick={() => goToPage(nextPage)}
                sx={{
                  minWidth: 30,
                  height: 28,
                  px: 0,
                  fontSize: 12,
                  fontWeight: nextPage === page ? 700 : 400,
                  borderRadius: 1.5,
                  color: nextPage === page ? '#fff' : 'text.secondary',
                  bgcolor: nextPage === page ? 'primary.main' : 'transparent',
                  '&:hover': { bgcolor: nextPage === page ? 'primary.dark' : 'rgba(0,0,0,0.04)' },
                }}
              >
                {nextPage}
              </Button>
            );
          })}
          <Button
            size="small"
            disabled={page === totalPages}
            onClick={() => goToPage(page + 1)}
            sx={{ minWidth: 32, px: 0.5, fontSize: 12, color: 'text.secondary' }}
          >
            ›
          </Button>
          <Typography variant="caption" sx={{ color: 'text.disabled', ml: 0.5, fontSize: 11 }}>
            {page}/{totalPages}
          </Typography>
        </Box>
      )}

      <Button
        variant="contained"
        color="error"
        size="small"
        disabled={selected.size === 0}
        onClick={doBatchDelete}
        startIcon={<DeleteIcon sx={{ fontSize: 16 }} />}
        sx={{ height: 30, fontSize: 12, borderRadius: 1.5, textTransform: 'none', boxShadow: 'none' }}
      >
        批量删除
      </Button>
    </Box>
  );
}
