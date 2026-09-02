<div wire:ghost id="paginated-table">
    <table>
        <thead>
            <tr>
                <th>Name</th>
                <th>Email</th>
            </tr>
        </thead>
        <tbody>
            @foreach ($rows as $row)
                <tr>
                    <td>{{ $row['name'] }}</td>
                    <td>{{ $row['email'] }}</td>
                </tr>
            @endforeach
        </tbody>
    </table>
    <button id="next-page-btn" wire:click="nextPage">Next</button>
</div>
