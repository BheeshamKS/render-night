// @vitest-environment jsdom
import {
  BlenderNumberField,
  CollapsiblePanel,
  PanelRow,
  SegmentedEnumToggle,
} from '../src/renderer/components/controls';

import React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { describe, expect, it, vi } from 'vitest';

describe('Three Reusable Blender-Style UI Controls', () => {
  describe('BlenderNumberField', () => {
    it('renders initial value and unit', () => {
      render(
        <BlenderNumberField label="Resolution X" value={1920} unit="px" onChange={() => {}} />,
      );

      expect(screen.getByText(/Resolution X/)).toBeDefined();
      expect(screen.getByText(/1920 px/)).toBeDefined();
    });

    it('switches to input on click and commits on blur with clamping', () => {
      const handleChange = vi.fn();
      render(<BlenderNumberField value={100} min={50} max={200} onChange={handleChange} />);

      const field = screen.getByText('100');
      fireEvent.mouseDown(field);
      fireEvent.mouseUp(field);

      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe('100');

      // Enter value exceeding max (300) -> clamped to 200
      fireEvent.change(input, { target: { value: '300' } });
      fireEvent.blur(input);

      expect(handleChange).toHaveBeenCalledWith(200);
    });

    it('displays override bar and calls onReset when clicked', () => {
      const handleReset = vi.fn();
      const { container } = render(
        <BlenderNumberField
          value={256}
          isOverridden={true}
          onReset={handleReset}
          onChange={() => {}}
        />,
      );

      const resetBtn = screen.getByTitle('Reset to file default');
      expect(resetBtn).toBeDefined();
      fireEvent.click(resetBtn);
      expect(handleReset).toHaveBeenCalledTimes(1);

      // Verify override indicator bar
      const accentBar = container.querySelector('.bg-rn-accent');
      expect(accentBar).not.toBeNull();
    });
  });

  describe('SegmentedEnumToggle', () => {
    it('renders segmented horizontal buttons for <= 4 items', () => {
      const handleChange = vi.fn();
      const items = [
        { identifier: 'PNG', name: 'PNG' },
        { identifier: 'JPEG', name: 'JPEG' },
        { identifier: 'OPEN_EXR', name: 'OpenEXR' },
      ];

      render(<SegmentedEnumToggle value="PNG" items={items} onChange={handleChange} />);

      const pngBtn = screen.getByRole('button', { name: 'PNG' });
      const exrBtn = screen.getByRole('button', { name: 'OpenEXR' });

      expect(pngBtn.className).toContain('bg-rn-accent');
      fireEvent.click(exrBtn);
      expect(handleChange).toHaveBeenCalledWith('OPEN_EXR');
    });

    it('renders a select dropdown for > 4 items', () => {
      const handleChange = vi.fn();
      const items = [
        { identifier: '1', name: 'One' },
        { identifier: '2', name: 'Two' },
        { identifier: '3', name: 'Three' },
        { identifier: '4', name: 'Four' },
        { identifier: '5', name: 'Five' },
      ];

      render(<SegmentedEnumToggle value="1" items={items} onChange={handleChange} />);

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select).toBeDefined();
      fireEvent.change(select, { target: { value: '3' } });
      expect(handleChange).toHaveBeenCalledWith('3');
    });

    it('displays reset button when overridden', () => {
      const handleReset = vi.fn();
      render(
        <SegmentedEnumToggle
          value="CYCLES"
          items={[{ identifier: 'CYCLES', name: 'Cycles' }]}
          isOverridden={true}
          onReset={handleReset}
          onChange={() => {}}
        />,
      );

      const resetBtn = screen.getByTitle('Reset to file default');
      fireEvent.click(resetBtn);
      expect(handleReset).toHaveBeenCalledTimes(1);
    });
  });

  describe('CollapsiblePanel and PanelRow (40/60 Layout)', () => {
    it('renders collapsible panel with title and toggle behavior', () => {
      render(
        <CollapsiblePanel title="Sampling" defaultExpanded={true}>
          <div>Panel Content</div>
        </CollapsiblePanel>,
      );

      expect(screen.getByText('Sampling')).toBeDefined();
      expect(screen.getByText('Panel Content')).toBeDefined();

      // Click to collapse
      fireEvent.click(screen.getByText('Sampling'));
      expect(screen.queryByText('Panel Content')).toBeNull();
    });

    it('renders PanelRow with 40/60 layout classes', () => {
      const { container } = render(
        <PanelRow label="Samples" isOverridden={true}>
          <input type="text" />
        </PanelRow>,
      );

      const labelCol = container.querySelector('.w-\\[40\\%\\]');
      const controlCol = container.querySelector('.w-\\[60\\%\\]');

      expect(labelCol).not.toBeNull();
      expect(labelCol?.textContent).toContain('Samples');
      expect(labelCol?.className).toContain('text-right');
      expect(controlCol).not.toBeNull();
    });

    it('renders section override badge and reset button', () => {
      const handleResetAll = vi.fn();
      render(
        <CollapsiblePanel title="Render Properties" overrideCount={3} onResetAll={handleResetAll}>
          <div>Body</div>
        </CollapsiblePanel>,
      );

      expect(screen.getByText('3 modified')).toBeDefined();
      const resetSectionBtn = screen.getByTitle('Reset this section to file defaults');
      fireEvent.click(resetSectionBtn);
      expect(handleResetAll).toHaveBeenCalledTimes(1);
    });
  });
});
