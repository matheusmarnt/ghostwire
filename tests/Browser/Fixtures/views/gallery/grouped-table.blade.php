<div wire:ghost id="grouped-table">
    <table>
        @foreach ($groups as $group => $items)
            <tr>
                <td colspan="2"><strong>{{ $group }}</strong></td>
            </tr>
            @foreach ($items as $item)
                <tr>
                    <td>{{ $item }}</td>
                    <td>in stock</td>
                </tr>
            @endforeach
        @endforeach
    </table>
    <button id="load-btn" wire:click="load">Load</button>
</div>
