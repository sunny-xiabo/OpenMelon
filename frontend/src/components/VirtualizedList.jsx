import React from 'react';
import { Box } from '@mui/material';
import { useVirtualizer } from '@tanstack/react-virtual';

export default function VirtualizedList({
  items = [],
  height = 480,
  estimateSize = 40,
  overscan = 8,
  getItemKey = (_, index) => index,
  renderItem,
  sx,
  innerSx,
  className,
  role,
  ariaLabel,
}) {
  const parentRef = React.useRef(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <Box
      ref={parentRef}
      className={className}
      role={role}
      aria-label={ariaLabel}
      sx={{
        position: 'relative',
        overflow: 'auto',
        height,
        minHeight: 0,
        width: '100%',
        ...sx,
      }}
    >
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          height: `${virtualizer.getTotalSize()}px`,
          ...innerSx,
        }}
      >
        {virtualItems.map((virtualItem) => {
          const item = items[virtualItem.index];
          return (
            <Box
              key={getItemKey(item, virtualItem.index)}
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {renderItem(item, virtualItem.index, virtualItem)}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
