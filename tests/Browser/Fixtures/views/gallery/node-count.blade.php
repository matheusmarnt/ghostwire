<div wire:ghost id="node-count">
    @for ($i = 0; $i < $count; $i++)
        <div class="gw-node gw-node-{{ $i }}">Item {{ $i }}</div>
    @endfor
    <button id="refresh-btn" wire:click="refresh">Refresh</button>
</div>
