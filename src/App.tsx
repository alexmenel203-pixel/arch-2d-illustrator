import { useState, useRef, useCallback, useEffect } from 'react';
import FindIllustration from './illustration/FindIllustration';
import { FindEditor } from './editor/FindEditor';
import { getRecentFinds, addRecentFind, removeRecentFind } from './utils/recentFinds';
import { exportSvg, exportPng } from './utils/exportIllustration';
import type { FindIllustrationSpec } from './types/find';

type View = 'gallery' | 'viewer' | 'editor';

function App() {
  const [view, setView] = useState<View>('gallery');
  const [viewedSpec, setViewedSpec] = useState<FindIllustrationSpec | undefined>(undefined);
  const [editorSpec, setEditorSpec] = useState<FindIllustrationSpec | undefined>(undefined);
  const [recentFinds, setRecentFinds] = useState<FindIllustrationSpec[]>(() => getRecentFinds());
  const svgRefs = useRef<Record<string, SVGSVGElement | null>>({});
  const viewerSvgRef = useRef<SVGSVGElement | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (view === 'gallery') {
      setRecentFinds(getRecentFinds());
    }
  }, [view]);

  const openViewer = (spec: FindIllustrationSpec) => {
    setViewedSpec({ ...spec, profile: spec.profile.map((p) => ({ ...p })), decorationBands: spec.decorationBands.map((b) => ({ ...b })) });
    setView('viewer');
    setMenuOpenId(null);
  };

  const openEditor = (spec?: FindIllustrationSpec) => {
    setEditorSpec(
      spec
        ? {
            ...spec,
            profile: spec.profile.map((p) => ({ ...p })),
            decorationBands: spec.decorationBands.map((b) => ({ ...b })),
          }
        : undefined
    );
    setView('editor');
    setViewedSpec(undefined);
    setMenuOpenId(null);
  };

  const backToGallery = () => {
    setView('gallery');
    setEditorSpec(undefined);
    setViewedSpec(undefined);
  };

  const handleSaveFromEditor = useCallback((spec: FindIllustrationSpec) => {
    addRecentFind(spec);
    setRecentFinds(getRecentFinds());
  }, []);

  const handleExportSvg = (spec: FindIllustrationSpec) => {
    const el = svgRefs.current[spec.id];
    if (el) exportSvg(el, spec.label || spec.id, spec);
    setMenuOpenId(null);
  };

  const handleExportPng = (spec: FindIllustrationSpec) => {
    const el = svgRefs.current[spec.id];
    if (el) exportPng(el, spec.label || spec.id);
    setMenuOpenId(null);
  };

  const handleDelete = (id: string) => {
    removeRecentFind(id);
    setRecentFinds(getRecentFinds());
    setMenuOpenId(null);
  };

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      <header className="border-b border-stone-300 bg-white/80 backdrop-blur px-6 py-4">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-800">
          Arch 2D Illustrator
        </h1>
        <p className="text-sm text-stone-500 mt-0.5">
          Technical 2D illustrations for archaeological sculptures — half exterior / half section
        </p>
      </header>

      <main className={view === 'editor' ? 'p-4 md:p-6 flex flex-col min-h-[calc(100dvh-6rem)]' : 'p-6'}>
        {view === 'gallery' && (
          <section className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between gap-4 mb-4">
              <h2 className="text-sm font-medium text-stone-500 uppercase tracking-wider">
                Recently edited
              </h2>
              <button
                type="button"
                onClick={() => openEditor()}
                className="text-sm font-medium text-stone-600 hover:text-stone-800 border border-stone-300 rounded-lg px-3 py-1.5"
              >
                + New sculpture
              </button>
            </div>
            {recentFinds.length === 0 ? (
              <p className="text-sm text-stone-500 py-8">
                No recent sculptures. Create one with <strong>+ New sculpture</strong> and export (SVG or PNG) to save it here.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-8">
                {recentFinds.map((spec) => (
                  <figure
                    key={spec.id}
                    className="flex flex-col items-center bg-white rounded-lg border border-stone-200 p-4 shadow-sm relative"
                  >
                    <button
                      type="button"
                      onClick={() => openViewer(spec)}
                      className="text-black [&_svg]:max-w-full [&_svg]:h-auto w-full flex justify-center cursor-pointer hover:opacity-90 transition-opacity rounded-t-lg border-0 bg-transparent p-0"
                    >
                      <FindIllustration
                        ref={(el) => {
                          svgRefs.current[spec.id] = el;
                        }}
                        spec={spec}
                        scale={1.8}
                      />
                    </button>
                    <div className="flex items-center justify-between w-full gap-2 mt-2 min-h-[1.5rem]">
                      {spec.label ? (
                        <figcaption className="text-xs text-stone-500 font-medium truncate">
                          {spec.label}
                        </figcaption>
                      ) : (
                        <span />
                      )}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditor(spec)}
                          className="text-xs text-stone-400 hover:text-stone-600"
                        >
                          Edit
                        </button>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setMenuOpenId(menuOpenId === spec.id ? null : spec.id)}
                            className="p-0.5 text-stone-400 hover:text-stone-600 rounded"
                            title="More actions"
                            aria-expanded={menuOpenId === spec.id}
                          >
                            <span className="sr-only">More</span>
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                              <circle cx="8" cy="4" r="1.5" />
                              <circle cx="8" cy="8" r="1.5" />
                              <circle cx="8" cy="12" r="1.5" />
                            </svg>
                          </button>
                          {menuOpenId === spec.id && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                aria-hidden
                                onClick={() => setMenuOpenId(null)}
                              />
                              <ul
                                className="absolute right-0 top-full mt-0.5 z-20 min-w-[8rem] py-1 bg-white border border-stone-200 rounded-md shadow-lg text-left"
                                role="menu"
                              >
                                <li role="none">
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => handleExportSvg(spec)}
                                    className="w-full px-3 py-1.5 text-left text-xs text-stone-700 hover:bg-stone-100"
                                  >
                                    Export SVG
                                  </button>
                                </li>
                                <li role="none">
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => handleExportPng(spec)}
                                    className="w-full px-3 py-1.5 text-left text-xs text-stone-700 hover:bg-stone-100"
                                  >
                                    Export PNG
                                  </button>
                                </li>
                                <li role="none" className="border-t border-stone-100">
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => handleDelete(spec.id)}
                                    className="w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
                                  >
                                    Delete
                                  </button>
                                </li>
                              </ul>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </figure>
                ))}
              </div>
            )}
          </section>
        )}

        {view === 'viewer' && viewedSpec && (
          <section className="max-w-4xl mx-auto flex flex-col items-center">
            <div className="flex items-center justify-between w-full gap-4 mb-4">
              <button
                type="button"
                onClick={backToGallery}
                className="text-sm font-medium text-stone-600 hover:text-stone-800"
              >
                ← Back
              </button>
              {viewedSpec.label && (
                <span className="text-sm font-medium text-stone-700 truncate">{viewedSpec.label}</span>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEditor(viewedSpec)}
                  className="text-sm font-medium text-stone-600 hover:text-stone-800 border border-stone-300 rounded-lg px-3 py-1.5"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => exportSvg(viewerSvgRef.current, viewedSpec.label || viewedSpec.id, viewedSpec)}
                  className="text-sm font-medium text-stone-600 hover:text-stone-800 border border-stone-300 rounded-lg px-3 py-1.5"
                >
                  Export SVG
                </button>
                <button
                  type="button"
                  onClick={() => exportPng(viewerSvgRef.current, viewedSpec.label || viewedSpec.id)}
                  className="text-sm font-medium text-stone-600 hover:text-stone-800 border border-stone-300 rounded-lg px-3 py-1.5"
                >
                  Export PNG
                </button>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-stone-200 p-6 shadow-sm">
              <FindIllustration
                ref={viewerSvgRef}
                spec={viewedSpec}
                scale={3}
              />
            </div>
          </section>
        )}

        {view === 'editor' && (
          <div className="flex-1 min-h-0 flex flex-col md:block">
            <FindEditor
              initialSpec={editorSpec}
              onReset={backToGallery}
              onSave={handleSaveFromEditor}
            />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
