import { BlenderDropdown } from './controls/BlenderDropdown';
import { BlenderNumberField } from './controls/BlenderNumberField';
import { CollapsiblePanel } from './controls/CollapsiblePanel';
import { SegmentedEnumToggle } from './controls/SegmentedEnumToggle';

import React, { useState } from 'react';

export const ComponentsShowcase: React.FC = () => {
  const [numVal1, setNumVal1] = useState(256);
  const [numVal2, setNumVal2] = useState(100);
  const [dropdownVal1, setDropdownVal1] = useState('CYCLES');
  const [dropdownVal2, setDropdownVal2] = useState('PNG');
  const [segmentedVal, setSegmentedVal] = useState('GPU');

  const engineOptions = [
    { value: 'CYCLES', label: 'Cycles', sublabel: 'Path Tracing' },
    { value: 'BLENDER_EEVEE_NEXT', label: 'EEVEE Next', sublabel: 'Realtime' },
    { value: 'BLENDER_WORKBENCH', label: 'Workbench', sublabel: 'Technical' },
  ];

  const formatOptions = [
    { value: 'PNG', label: 'PNG Image', sublabel: 'Lossless' },
    { value: 'OPEN_EXR', label: 'OpenEXR', sublabel: '32-bit Float' },
    { value: 'FFMPEG', label: 'FFmpeg Video', sublabel: 'H.264/MP4' },
    { value: 'TIFF', label: 'TIFF Image', sublabel: 'Uncompressed' },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-rn-bg text-rn-text select-none">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">
            Blender-Native Controls Showcase (/components)
          </h1>
          <p className="text-xs text-rn-muted mt-1">
            Standardized UI component catalog in all interactive states: default, hover, focus,
            active, disabled, modified, and error.
          </p>
        </div>

        {/* 1. Blender Number Field */}
        <CollapsiblePanel
          title="1. BlenderNumberField (Drag to scrub, click to type)"
          defaultOpen={true}
        >
          <div className="grid grid-cols-2 gap-4 py-2">
            <div>
              <span className="text-[11px] text-rn-muted block mb-1">Default (Unmodified)</span>
              <BlenderNumberField
                label="Samples"
                value={numVal1}
                min={1}
                max={4096}
                step={1}
                onChange={setNumVal1}
                unit="samples"
              />
            </div>

            <div>
              <span className="text-[11px] text-rn-muted block mb-1">
                Modified / Overridden (Blue accent + Reset)
              </span>
              <BlenderNumberField
                label="Resolution %"
                value={numVal2}
                min={1}
                max={200}
                step={5}
                isOverridden={true}
                onReset={() => setNumVal2(100)}
                onChange={setNumVal2}
                unit="%"
              />
            </div>

            <div>
              <span className="text-[11px] text-rn-muted block mb-1">Float / Fine Precision</span>
              <BlenderNumberField
                label="Noise Threshold"
                value={0.05}
                min={0.001}
                max={1}
                step={0.01}
                precision={3}
                onChange={() => {}}
              />
            </div>

            <div>
              <span className="text-[11px] text-rn-muted block mb-1">Disabled State</span>
              <BlenderNumberField
                label="Locked Property"
                value={1920}
                disabled={true}
                onChange={() => {}}
                unit="px"
              />
            </div>
          </div>
        </CollapsiblePanel>

        {/* 2. Custom Searchable Dropdown */}
        <CollapsiblePanel
          title="2. BlenderDropdown (Keyboard Navigation & Search)"
          defaultOpen={true}
        >
          <div className="grid grid-cols-2 gap-4 py-2">
            <div>
              <span className="text-[11px] text-rn-muted block mb-1">
                Searchable (Render Engine)
              </span>
              <BlenderDropdown
                value={dropdownVal1}
                options={engineOptions}
                onChange={setDropdownVal1}
                className="w-full"
              />
            </div>

            <div>
              <span className="text-[11px] text-rn-muted block mb-1">
                Overridden State (Accent border)
              </span>
              <BlenderDropdown
                value={dropdownVal2}
                options={formatOptions}
                onChange={setDropdownVal2}
                isOverridden={true}
                className="w-full"
              />
            </div>

            <div>
              <span className="text-[11px] text-rn-muted block mb-1">Disabled Dropdown</span>
              <BlenderDropdown
                value="PNG"
                options={formatOptions}
                disabled={true}
                onChange={() => {}}
                className="w-full"
              />
            </div>
          </div>
        </CollapsiblePanel>

        {/* 3. Segmented Enum Toggle */}
        <CollapsiblePanel title="3. SegmentedEnumToggle" defaultOpen={true}>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div>
              <span className="text-[11px] text-rn-muted block mb-1">2-Option Segmented</span>
              <SegmentedEnumToggle
                value={segmentedVal}
                options={[
                  { value: 'GPU', label: 'GPU Compute' },
                  { value: 'CPU', label: 'CPU' },
                ]}
                onChange={setSegmentedVal}
              />
            </div>

            <div>
              <span className="text-[11px] text-rn-muted block mb-1">
                3-Option Segmented (Color Mode)
              </span>
              <SegmentedEnumToggle
                value="RGBA"
                options={[
                  { value: 'BW', label: 'BW' },
                  { value: 'RGB', label: 'RGB' },
                  { value: 'RGBA', label: 'RGBA' },
                ]}
                onChange={() => {}}
              />
            </div>
          </div>
        </CollapsiblePanel>

        {/* 4. Status Chips & Badges */}
        <CollapsiblePanel title="4. Status Chips & Badges" defaultOpen={true}>
          <div className="flex flex-wrap gap-2 py-2">
            <span className="rounded-full border border-neutral-700 bg-neutral-800 px-2.5 py-0.5 text-xs font-semibold uppercase text-neutral-300">
              Queued
            </span>
            <span className="rounded-full border border-blue-800 bg-blue-950/70 px-2.5 py-0.5 text-xs font-semibold uppercase text-blue-400 animate-pulse">
              Inspecting
            </span>
            <span className="rounded-full border border-amber-800 bg-amber-950/70 px-2.5 py-0.5 text-xs font-semibold uppercase text-amber-400">
              Rendering
            </span>
            <span className="rounded-full border border-emerald-800 bg-emerald-950/70 px-2.5 py-0.5 text-xs font-semibold uppercase text-emerald-400">
              Completed
            </span>
            <span className="rounded-full border border-rose-800 bg-rose-950/70 px-2.5 py-0.5 text-xs font-semibold uppercase text-rose-400">
              Failed
            </span>
            <span className="rounded-full border border-neutral-800 bg-neutral-900 px-2.5 py-0.5 text-xs font-semibold uppercase text-neutral-500">
              Skipped
            </span>
          </div>
        </CollapsiblePanel>
      </div>
    </div>
  );
};
