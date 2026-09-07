<div>
    <div wire:ghost.freeze id="summary">
        <p>{{ count($rows) }} rows</p>
    </div>

    <ul wire:ghost id="list">
        @foreach ($rows as $row)
            <li>{{ $row }}</li>
        @endforeach
    </ul>

    <button wire:click="refresh" id="refresh-btn">Refresh</button>
    <button wire:click="renderlessBump" id="renderless-btn">Renderless Bump</button>
</div>
