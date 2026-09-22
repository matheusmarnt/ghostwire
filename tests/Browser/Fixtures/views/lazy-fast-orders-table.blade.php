<div id="lazy-fast-orders-table">
    <ul id="lazy-fast-list">
        @foreach ($rows as $row)
            <li>{{ $row }}</li>
        @endforeach
    </ul>
    <button id="bump-btn" wire:click="bump">Bump</button>
</div>
