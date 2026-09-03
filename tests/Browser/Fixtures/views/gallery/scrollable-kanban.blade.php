<div wire:ghost id="scrollable-kanban">
    <div id="kanban-column" class="kanban-column" style="height: 200px; overflow-y: auto; position: relative;">
        <div id="kanban-spacer" style="height: 60px;"></div>
        <div id="kanban-header" class="kanban-header" style="position: sticky; top: 0; background: white; height: 24px;">Column header</div>
        @foreach ($cards as $i => $card)
            <div class="kanban-card" id="kcard-{{ $i }}" style="height: 40px;">{{ $card }}</div>
        @endforeach
    </div>
    <button id="refresh-btn" wire:click="refresh">Refresh</button>
</div>
