import React from 'react';
import {
  Button,
  Chip,
  IconButton,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { MoreVert } from '@mui/icons-material';
import { MODULE_STATUS_META } from './constants';

export default function ModuleList({ modules, activeModuleId, setActiveModuleId, moduleCounts, activeInterfaceCount, openModuleMenu }) {
  return (
    <Paper elevation={0} sx={{ p: 1.5, borderRadius: 3, border: '1px solid rgba(15, 23, 42, 0.08)', bgcolor: '#ffffff' }}>
      <Stack spacing={1}>
        <Button
          fullWidth
          variant={!activeModuleId ? 'contained' : 'outlined'}
          onClick={() => setActiveModuleId('')}
          sx={{ justifyContent: 'space-between' }}
        >
          全部模块
          <Chip size="small" label={activeInterfaceCount} />
        </Button>
        {modules.map((module) => {
          const moduleStatus = MODULE_STATUS_META[module.status] || { label: module.status || '未知', color: 'default' };
          const isModuleExcluded = ['excluded', 'removed'].includes(module.status);
          return (
            <Stack key={module.module_id} direction="row" spacing={0.75} alignItems="center" sx={{ opacity: isModuleExcluded ? 0.65 : 1 }}>
              <Button
                fullWidth
                variant={activeModuleId === module.module_id ? 'contained' : 'outlined'}
                onClick={() => setActiveModuleId(module.module_id)}
                sx={{ justifyContent: 'space-between', textAlign: 'left', minWidth: 0 }}
              >
                <Typography noWrap variant="body2" fontWeight={700}>{module.name}</Typography>
                <Stack direction="row" spacing={0.5} alignItems="center">
                  {module.status !== 'active' && <Chip size="small" label={moduleStatus.label} color={moduleStatus.color} variant="outlined" />}
                  <Chip size="small" label={moduleCounts[module.module_id] || 0} />
                </Stack>
              </Button>
              <IconButton size="small" aria-label={`${module.name} 模块操作`} onClick={(event) => openModuleMenu(event, module)}>
                <MoreVert fontSize="small" />
              </IconButton>
            </Stack>
          );
        })}
      </Stack>
    </Paper>
  );
}
