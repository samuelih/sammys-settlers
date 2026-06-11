/// <reference types="vite/client" />

// Ambient module declarations so strict TS accepts CSS / CSS-module imports.

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.css';
