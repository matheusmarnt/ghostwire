<div wire:ghost id="card-grid">
    @foreach ($cards as $i => $card)
        <div class="card" id="card-{{ $i }}">
            <h3>{{ $card['title'] }}</h3>
            <p>{{ $card['body'] }}</p>
        </div>
    @endforeach
    <button id="refresh-btn" wire:click="refresh">Refresh</button>
</div>
