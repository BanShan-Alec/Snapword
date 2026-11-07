type RendererEntry = { path: string } | URL;

export type AppInitConfig = {
  preload: {
    path: string;
  };

  windows: {
    home: RendererEntry;
    updater: RendererEntry;
  };
};
