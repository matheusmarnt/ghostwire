<div wire:ghost id="repeat-list">
    <ul>
        @foreach ($items as $i => $item)
            <li class="row" id="row-{{ $i }}">{{ $item }}</li>
        @endforeach
    </ul>
    <button id="refresh-btn" wire:click="refresh">Refresh</button>
</div>
