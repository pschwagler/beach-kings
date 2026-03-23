---
name: frontend-patterns
description: Frontend development patterns for React, Next.js App Router, and Chakra UI. Component composition, state management, performance, and accessibility.
---

# Frontend Development Patterns

Patterns for building components with React 18, Next.js 14 App Router, TypeScript, and Chakra UI.

## When to Activate

- Building React components
- Managing state (useState, useReducer, Context)
- Implementing data fetching (server components, client fetch)
- Optimizing performance (memoization, code splitting)
- Working with forms
- Building accessible, responsive UI

## Component Patterns

### Composition with Chakra UI

```typescript
import { Box, Flex, FlexProps, Text } from '@chakra-ui/react';

interface CardProps extends FlexProps {
  title: string;
  children: React.ReactNode;
}

export default function Card({
  title,
  children,
  ...rest
}: CardProps): React.ReactNode {
  return (
    <Flex
      direction="column"
      bg="#FBFBFB"
      borderRadius="8px"
      border="1px"
      borderColor="#DBDCE1"
      p={4}
      {...rest}
    >
      <Text fontWeight="bold" color="blackAlpha.800" mb={2}>
        {title}
      </Text>
      <Box>{children}</Box>
    </Flex>
  );
}
```

Key points:
- Extend Chakra's props (e.g., `FlexProps`) for composability via `...rest`
- Props as `interface`, destructured in signature
- Explicit return types on exported components
- Prop-based styling, not raw CSS

### Compound Components

```typescript
import { createContext, useContext, useState } from 'react';
import { Box, Button } from '@chakra-ui/react';

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const TabsContext = createContext<TabsContextValue | undefined>(undefined);

export function Tabs({
  children,
  defaultTab,
}: {
  children: React.ReactNode;
  defaultTab: string;
}): React.ReactNode {
  const [activeTab, setActiveTab] = useState(defaultTab);

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      {children}
    </TabsContext.Provider>
  );
}

function useTabs(): TabsContextValue {
  const context = useContext(TabsContext);
  if (!context) throw new Error('Tab must be used within Tabs');
  return context;
}

export function Tab({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}): React.ReactNode {
  const { activeTab, setActiveTab } = useTabs();
  const isActive = activeTab === id;

  return (
    <Button
      variant="unstyled"
      color={isActive ? '#2800D7' : '#5E6272'}
      fontWeight={isActive ? 'bold' : 'normal'}
      onClick={() => setActiveTab(id)}
    >
      {children}
    </Button>
  );
}
```

### Server vs Client Components

```typescript
// layout.tsx - Server component (default in App Router)
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Page Title',
};

export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <main>{children}</main>;
}

// InteractiveWidget.tsx - Client component (opt-in)
'use client';

import { useState } from 'react';
import { Box } from '@chakra-ui/react';

export default function InteractiveWidget(): React.ReactNode {
  const [isOpen, setIsOpen] = useState(false);
  return <Box onClick={() => setIsOpen(!isOpen)}>{/* ... */}</Box>;
}
```

Only add `'use client'` when the component needs interactivity (hooks, event handlers, browser APIs).

## Custom Hooks

### State Management Hook

```typescript
import { useCallback, useState } from 'react';

export function useToggle(
  initialValue = false
): [boolean, () => void] {
  const [value, setValue] = useState(initialValue);
  const toggle = useCallback(() => setValue((v) => !v), []);
  return [value, toggle];
}
```

### Debounce Hook

```typescript
import { useEffect, useState } from 'react';

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}
```

### API Fetch Hook

```typescript
import { useCallback, useEffect, useState } from 'react';

interface UseFetchResult<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

export function useFetch<T>(url: string): UseFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      setData(await res.json());
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, error, loading, refetch };
}
```

## State Management

This project uses local state (`useState`) and Context. No external state library.

### Context + Reducer

```typescript
import { createContext, useContext, useReducer, Dispatch } from 'react';

interface State {
  query: string;
  loading: boolean;
}

type Action =
  | { type: 'SET_QUERY'; payload: string }
  | { type: 'SET_LOADING'; payload: boolean };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_QUERY':
      return { ...state, query: action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    default:
      return state;
  }
}

const AppContext = createContext<
  { state: State; dispatch: Dispatch<Action> } | undefined
>(undefined);

export function AppProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  const [state, dispatch] = useReducer(reducer, {
    query: '',
    loading: false,
  });

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
```

## Chakra UI Styling Patterns

### Responsive Props

```typescript
<Flex
  direction={{ base: 'column', md: 'row' }}
  px={{ base: 4, md: 8 }}
  gap={{ base: 2, md: 4 }}
>
  {children}
</Flex>
```

### Hover and Interactive States

```typescript
// For simple CSS hover, use Chakra's pseudo props
<Box _hover={{ bg: '#EEEBFF', color: '#2800D7' }}>
  Hover me
</Box>

// For hover that drives JS logic (e.g., icon color changes), use state
const [isHovered, setIsHovered] = useState(false);
const color = isHovered ? '#2800D7' : '#5E6272';

<Box
  onMouseEnter={() => setIsHovered(true)}
  onMouseLeave={() => setIsHovered(false)}
>
  <SomeIcon color={color} />
</Box>
```

### Brand Palette

```
#2800D7  - brand purple (primary actions, active states)
#5E6272  - neutral gray (default text, icons)
#FBFBFB  - background
#DBDCE1  - borders, dividers
#EEEBFF  - hover purple (light backgrounds)
#32343C  - dark text
```

## Performance

### Memoization

```typescript
import { useMemo, useCallback, memo } from 'react';

// Expensive computation
const sorted = useMemo(
  () => items.sort((a, b) => b.score - a.score),
  [items]
);

// Stable callback for child components
const handleSearch = useCallback((query: string) => {
  setSearchQuery(query);
}, []);

// Pure component that skips re-renders
const ListItem = memo<{ item: Item }>(function ListItem({ item }) {
  return <Box>{item.name}</Box>;
});
```

### Code Splitting

```typescript
import { lazy, Suspense } from 'react';
import { Spinner } from '@chakra-ui/react';

const HeavyComponent = lazy(() => import('./HeavyComponent'));

export default function Page(): React.ReactNode {
  return (
    <Suspense fallback={<Spinner color="#2800D7" />}>
      <HeavyComponent />
    </Suspense>
  );
}
```

## Accessibility

### Keyboard Navigation

```typescript
const handleKeyDown = (e: React.KeyboardEvent) => {
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, options.length - 1));
      break;
    case 'ArrowUp':
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      break;
    case 'Enter':
      e.preventDefault();
      onSelect(options[activeIndex]);
      break;
    case 'Escape':
      onClose();
      break;
  }
};
```

### Focus Management

```typescript
import { useEffect, useRef } from 'react';

export function Modal({
  isOpen,
  onClose,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}): React.ReactNode {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      modalRef.current?.focus();
    } else {
      previousFocusRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      {children}
    </div>
  );
}
```

## Conditional Rendering

```typescript
// Clear and scannable
{loading && <Spinner color="#2800D7" />}
{error && <ErrorMessage error={error} />}
{data && <DataDisplay data={data} />}

// Avoid ternary nesting
// Bad: {a ? <A /> : b ? <B /> : <C />}
```

## Animation (Framer Motion)

```typescript
import { motion, AnimatePresence } from 'framer-motion';

export function AnimatedList({
  items,
}: {
  items: Item[];
}): React.ReactNode {
  return (
    <AnimatePresence>
      {items.map((item) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
        >
          <ItemCard item={item} />
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
```
