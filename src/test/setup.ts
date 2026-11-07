import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { configure } from '@testing-library/react';

// findBy and waitFor give up after one second by default. Lazy chunks and IndexedDB work can take longer
// on a busy CI machine, which made a few tests fail now and then (Drop 14), so allow five.
configure({ asyncUtilTimeout: 5000 });
