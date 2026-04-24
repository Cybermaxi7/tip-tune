import { render } from '@testing-library/react';
import { screen, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { vi } from 'vitest';
import SearchBar from '../SearchBar';
import { SearchSuggestionItem } from '../../../types/search.types';

describe('SearchBar', () => {
  const mockOnQueryChange = vi.fn();
  const mockOnSelectSuggestion = vi.fn();
  const mockOnVoiceResult = vi.fn();
  const mockOnSubmit = vi.fn();

  const suggestions: SearchSuggestionItem[] = [
    { type: 'artist', id: '1', title: 'Artist One', subtitle: 'Pop' },
    { type: 'track', id: '2', title: 'Track Two', subtitle: 'Artist One' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders input with placeholder', () => {
    render(
      <SearchBar
        query=""
        onQueryChange={mockOnQueryChange}
        suggestions={[]}
        suggestionsLoading={false}
        onSelectSuggestion={mockOnSelectSuggestion}
        onVoiceResult={mockOnVoiceResult}
        onSubmit={mockOnSubmit}
      />
    );
    expect(screen.getByPlaceholderText(/Search artists, tracks/)).toBeInTheDocument();
  });

  it('calls onQueryChange when typing', async () => {
    const user = userEvent.setup();
    render(
      <SearchBar
        query=""
        onQueryChange={mockOnQueryChange}
        suggestions={[]}
        suggestionsLoading={false}
        onSelectSuggestion={mockOnSelectSuggestion}
        onVoiceResult={mockOnVoiceResult}
        onSubmit={mockOnSubmit}
      />
    );
    await user.type(screen.getByRole('searchbox'), 'test');
    expect(mockOnQueryChange).toHaveBeenCalledTimes(4);
  });

  it('shows suggestions when query length >= 2', async () => {
    const user = userEvent.setup();
    render(
      <SearchBar
        query="te"
        onQueryChange={mockOnQueryChange}
        suggestions={suggestions}
        suggestionsLoading={false}
        onSelectSuggestion={mockOnSelectSuggestion}
        onVoiceResult={mockOnVoiceResult}
        onSubmit={mockOnSubmit}
      />
    );
    
    const input = screen.getByRole('searchbox');
    await user.click(input);
    
    const listbox = await screen.findByRole('listbox');
    const options = within(listbox).getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent('Artist One');
    expect(options[1]).toHaveTextContent('Track Two');
  });

  it('calls onSelectSuggestion when clicking a suggestion', async () => {
    const user = userEvent.setup();
    render(
      <SearchBar
        query="te"
        onQueryChange={mockOnQueryChange}
        suggestions={suggestions}
        suggestionsLoading={false}
        onSelectSuggestion={mockOnSelectSuggestion}
        onVoiceResult={mockOnVoiceResult}
        onSubmit={mockOnSubmit}
      />
    );

    const input = screen.getByRole('searchbox');
    await user.click(input);
    
    const listbox = await screen.findByRole('listbox');
    await user.click(within(listbox).getAllByRole('option')[0]);
    expect(mockOnSelectSuggestion).toHaveBeenCalledWith(suggestions[0]);
    expect(mockOnQueryChange).toHaveBeenCalledWith('Artist One');
  });

  it('calls onSubmit when form is submitted', async () => {
    const user = userEvent.setup();
    render(
      <SearchBar
        query="test"
        onQueryChange={mockOnQueryChange}
        suggestions={[]}
        suggestionsLoading={false}
        onSelectSuggestion={mockOnSelectSuggestion}
        onVoiceResult={mockOnVoiceResult}
        onSubmit={mockOnSubmit}
      />
    );

    const input = screen.getByRole('searchbox');
    await user.type(input, '{enter}');
    expect(mockOnSubmit).toHaveBeenCalled();
  });
});
